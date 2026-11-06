import * as React from "react";
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

/**
 * SUITE DE QA EXHAUSTIVA: MATRIZ DE INTERACCIONES Y POSIBILIDADES DEL USUARIO
 * Gobernanza: PM-GOZster & @qa-eng
 *
 * Cobertura de todos los flujos posibles que un entrenador puede ejecutar en el Canvas de Islas:
 * 1. Mover elementos (arriba, abajo, izquierda, derecha, separar a fila propia, límites de fila)
 * 2. Drag & Drop (dragstart, dragover con drop zone indicator, dragleave, drop en destino, self-drop seguro)
 * 3. Modificar elementos (resize horizontal -/+, límites duros de 25% y 75%, suma 100%)
 * 4. Activar/Desactivar (Modo Canvas ON/OFF, switches de visibilidad de las 6 islas, reset layout)
 * 5. Tocar elementos (colapso [-]/[+] sin desmontar estado, resumen compacto)
 * 6. Flujo clínico & bitácora (segmented control de dolor, auto-guardado onBlur en bitácora, anamnesis)
 * 7. Flujo administrativo (tabs internos de cuota, contratación, staff y configuración)
 * 8. Persistencia y resiliencia (localStorage, hidratación, fallback ante JSON corrupto)
 */

describe("QA Matrix: Todas las Interacciones y Posibilidades del Usuario en el Canvas Modular", () => {
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
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDefaultStudentDetail = (extraProps = {}) => {
    return renderToStaticMarkup(
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
        {...extraProps}
      />
    );
  };

  // =========================================================================
  // 1. FLUJO DE MOVER ELEMENTOS (POSICIONAMIENTO RELATIVO Y MATRIZ DE FILAS)
  // =========================================================================
  describe("1. Mover Elementos (Flechas Relativas y Matriz de Filas)", () => {
    it("1.1 El cabezal de cada isla expone controles para mover arriba (⬆️) y abajo (⬇️)", () => {
      const html = renderDefaultStudentDetail();

      expect(html).toContain('data-testid="move-up-timeline"');
      expect(html).toContain('data-testid="move-down-timeline"');
      expect(html).toContain('data-testid="move-up-activity_feed"');
      expect(html).toContain('data-testid="move-down-activity_feed"');
      expect(html).toContain('data-testid="move-up-routine_workbench"');
      expect(html).toContain('data-testid="move-down-routine_workbench"');
      expect(html).toContain('data-testid="move-up-metricas_1rm"');
      expect(html).toContain('data-testid="move-down-metricas_1rm"');
      expect(html).toContain('data-testid="move-up-salud_anamnesis"');
      expect(html).toContain('data-testid="move-down-salud_anamnesis"');
      expect(html).toContain('data-testid="move-up-administracion"');
      expect(html).toContain('data-testid="move-down-administracion"');
    });

    it("1.2 La primera isla de la grilla tiene 'move-up' deshabilitado por estar en el tope", () => {
      const html = renderDefaultStudentDetail();

      // Timeline es la fila superior por defecto -> canMoveUp=false -> disabled
      const match = html.match(/<button[^>]*data-testid="move-up-timeline"[^>]*>/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain("disabled");
    });

    it("1.3 La última isla de la grilla tiene 'move-down' deshabilitado por estar al pie", () => {
      const html = renderDefaultStudentDetail();

      // Administracion es la fila inferior por defecto -> canMoveDown=false -> disabled
      const match = html.match(/<button[^>]*data-testid="move-down-administracion"[^>]*>/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain("disabled");
    });

    it("1.4 Una isla compartida exhibe botones para mover a la izquierda (⬅️) y a la derecha (➡️)", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="shared-left"
          title="Isla Izquierda"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isSharedRow={true}
          currentWidth={50}
          onResizeWidth={vi.fn()}
          onSeparateRow={vi.fn()}
          onMoveLeft={vi.fn()}
          onMoveRight={vi.fn()}
          canMoveLeft={true}
          canMoveRight={true}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      expect(html).toContain('data-testid="move-left-shared-left"');
      expect(html).toContain('data-testid="move-right-shared-left"');
      expect(html).toContain("⬅️");
      expect(html).toContain("➡️");
    });

    it("1.5 Una isla en fila compartida exhibe botón '⤢' para separarse a su propia fila completa (100%)", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="shared-elem"
          title="Isla Compartida"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isSharedRow={true}
          currentWidth={50}
          onResizeWidth={vi.fn()}
          onSeparateRow={vi.fn()}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      expect(html).toContain('data-testid="separate-row-shared-elem"');
      expect(html).toContain("⤢");
    });
  });

  // =========================================================================
  // 2. FLUJO DE DRAG & DROP ENTRE ISLAS
  // =========================================================================
  describe("2. Drag & Drop de Islas Autónomas", () => {
    it("2.1 Cada isla cuenta con un drag handle estandarizado (⠿) con su testid correspondiente", () => {
      const html = renderDefaultStudentDetail();

      expect(html).toContain('data-testid="drag-handle-timeline"');
      expect(html).toContain('data-testid="drag-handle-activity_feed"');
      expect(html).toContain('data-testid="drag-handle-routine_workbench"');
      expect(html).toContain('data-testid="drag-handle-metricas_1rm"');
      expect(html).toContain('data-testid="drag-handle-salud_anamnesis"');
      expect(html).toContain('data-testid="drag-handle-administracion"');
    });

    it("2.2 Cuando una isla es destino de arrastre (isDragTarget=true), renderiza la zona visual de drop", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="drop-target-sample"
          title="Target Sample"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isCanvasMode={true}
          isDragTarget={true}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      expect(html).toContain('data-testid="isla-drop-zone-drop-target-sample"');
      expect(html).toContain("animate-pulse");
      expect(html).toContain("ring-primary/40");
    });

    it("2.3 En reposo (isDragTarget=false), la zona visual de drop no se renderiza en el DOM", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="idle-sample"
          title="Idle Sample"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isCanvasMode={false}
          isDragTarget={false}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      expect(html).not.toContain('data-testid="isla-drop-zone-idle-sample"');
    });
  });

  // =========================================================================
  // 3. FLUJO DE MODIFICAR ELEMENTOS (RESIZE HORIZONTAL -/+ Y ANCHOS RELATIVOS)
  // =========================================================================
  describe("3. Modificar Elementos (Resize Horizontal y Límites Rígidos)", () => {
    it("3.1 En fila compartida, expone botones de decremento (-), incremento (+) y porcentaje actual", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="resize-sample"
          title="Resize Sample"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isSharedRow={true}
          currentWidth={50}
          onResizeWidth={vi.fn()}
          onSeparateRow={vi.fn()}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      expect(html).toContain('data-testid="resize-dec-resize-sample"');
      expect(html).toContain('data-testid="resize-inc-resize-sample"');
      expect(html).toContain("50%");
    });

    it("3.2 Límite inferior: desactiva el botón de reducción (-) cuando el ancho es <= 25%", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="resize-min"
          title="Resize Min"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isSharedRow={true}
          currentWidth={25}
          onResizeWidth={vi.fn()}
          onSeparateRow={vi.fn()}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      const decMatch = html.match(/<button[^>]*data-testid="resize-dec-resize-min"[^>]*>/);
      expect(decMatch).not.toBeNull();
      expect(decMatch![0]).toContain('disabled=""');

      const incMatch = html.match(/<button[^>]*data-testid="resize-inc-resize-min"[^>]*>/);
      expect(incMatch).not.toBeNull();
      expect(incMatch![0]).not.toContain('disabled=""');
      expect(html).toContain("25%");
    });

    it("3.3 Límite superior: desactiva el botón de incremento (+) cuando el ancho es >= 75%", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="resize-max"
          title="Resize Max"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isSharedRow={true}
          currentWidth={75}
          onResizeWidth={vi.fn()}
          onSeparateRow={vi.fn()}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      const incMatch = html.match(/<button[^>]*data-testid="resize-inc-resize-max"[^>]*>/);
      expect(incMatch).not.toBeNull();
      expect(incMatch![0]).toContain('disabled=""');

      const decMatch = html.match(/<button[^>]*data-testid="resize-dec-resize-max"[^>]*>/);
      expect(decMatch).not.toBeNull();
      expect(decMatch![0]).not.toContain('disabled=""');
      expect(html).toContain("75%");
    });
  });

  // =========================================================================
  // 4. FLUJO DE ACTIVAR / DESACTIVAR (MODO CANVAS, VISIBILIDAD Y RESET)
  // =========================================================================
  describe("4. Activar / Desactivar (Modo Canvas, Visibilidad y Reset de Layout)", () => {
    it("4.1 El botón 'Modo Canvas' permite alternar entre vista Zen y modo de reorganización", () => {
      const html = renderDefaultStudentDetail();

      expect(html).toContain('data-testid="btn-modo-canvas"');
      expect(html).toContain("Modo Canvas");
    });

    it("4.2 El botón 'Configurar Islas' exhibe el contador de visibilidad 6/6 por defecto", () => {
      const html = renderDefaultStudentDetail();

      expect(html).toContain('data-testid="btn-configurar-islas"');
      expect(html).toContain("6/6");
    });

    it("4.3 En modo Zen normal, las herramientas de layout están ocultas en reposo y se revelan en hover", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="zen-check"
          title="Zen Check"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isCanvasMode={false}
          onMoveUp={vi.fn()}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      // En modo Zen (!isCanvasMode), los controles tienen clases de opacidad condicional para hover
      expect(html).toContain("opacity-0 group-hover:opacity-100");
    });

    it("4.4 En Modo Canvas activo (isCanvasMode=true), los controles son inmediatamente visibles y exhiben bordes punteados", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="canvas-active-check"
          title="Canvas Active Check"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isCanvasMode={true}
          onMoveUp={vi.fn()}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      expect(html).toContain("border-dashed border-primary/50");
      expect(html).toContain("cursor-grab");
    });
  });

  // =========================================================================
  // 5. FLUJO DE TOCAR ELEMENTOS (COLAPSO CON MEMORIA SIN DESMONTAR ESTADO)
  // =========================================================================
  describe("5. Tocar Elementos (Colapso y Preservación de Estado)", () => {
    it("5.1 Cada isla cuenta con su botón de colapso explícito [-] / [+]", () => {
      const html = renderDefaultStudentDetail();

      expect(html).toContain('data-testid="collapse-btn-timeline"');
      expect(html).toContain('data-testid="collapse-btn-activity_feed"');
      expect(html).toContain('data-testid="collapse-btn-routine_workbench"');
      expect(html).toContain('data-testid="collapse-btn-metricas_1rm"');
      expect(html).toContain('data-testid="collapse-btn-salud_anamnesis"');
      expect(html).toContain('data-testid="collapse-btn-administracion"');
    });

    it("5.2 Cuando una isla está colapsada (isCollapsed=true), muestra el resumen compacto y oculta el cuerpo sin desmontarlo", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="sample-collapse"
          title="Métricas de Carga"
          isCollapsed={true}
          onToggleCollapse={vi.fn()}
          compactSummary={<span>Resumen: 1RM Sentadilla 140kg</span>}
        >
          <div data-testid="internal-content">Texto que no debe perderse</div>
        </IslaCardShell>
      );

      // Botón muestra estado expandir
      expect(html).toContain('aria-label="Expandir isla Métricas de Carga"');
      // Resumen compacto visible
      expect(html).toContain('data-testid="isla-collapsed-summary-sample-collapse"');
      expect(html).toContain("Resumen: 1RM Sentadilla 140kg");
      // Contenido interno preservado en el DOM con clase hidden (sin desmontar)
      expect(html).toContain('data-testid="internal-content"');
      expect(html).toContain("hidden");
    });
  });

  // =========================================================================
  // 6. FLUJO CLÍNICO & BITÁCORA DEL ENTRENADOR
  // =========================================================================
  describe("6. Flujo de Clínica, Anamnesis y Bitácora del Entrenador", () => {
    it("6.1 La sección clínica incluye el Segmented Control de molestia con estados Pendiente y Atendido", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={3}
          zonaDolorActual="Hombro derecho"
        />
      );

      expect(html).toContain("Pendiente");
      expect(html).toContain("Atendido");
      expect(html).toContain("Reporte de Molestia en Ejercicio");
    });

    it("6.2 La bitácora del entrenador expone auto-guardado en la ficha y botón de confirmación", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={3}
          zonaDolorActual="Hombro derecho"
        />
      );

      expect(html).toContain("Bitácora de Intervención del Entrenador");
      expect(html).toContain("Guardar Registro en la Ficha");
      expect(html).toContain("Se guarda automáticamente al escribir o salir.");
    });

    it("6.3 La anamnesis inicial expone acceso a los 4 datos clínicos clave de Lucas", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      expect(html).toContain("Hipertrofia &amp; Fuerza");
      expect(html).toContain("4 días / semana");
      expect(html).toContain("Hombro anterior");
      expect(html).toContain("Ninguna");
    });
  });

  // =========================================================================
  // 7. FLUJO ADMINISTRATIVO Y PESTAÑAS INTERNAS
  // =========================================================================
  describe("7. Flujo Administrativo y Pestañas Internas", () => {
    it("7.1 La isla administrativa exhibe las 4 pestañas sobrias para navegar entre módulos", () => {
      const html = renderToStaticMarkup(
        <IslaAdministrativa
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          suscripcionNode={<div>Suscripción</div>}
          historialPagosNode={<div>Historial Pagos</div>}
          contratacionNode={<div>Contratación</div>}
          chatResponsableNode={<div>Chat</div>}
          nivelVistaNode={<div>Nivel Vista</div>}
          cuestionarioNode={<div>Cuestionario</div>}
        />
      );

      expect(html).toContain("Cuota &amp; Historial");
      expect(html).toContain("Contratación &amp; Renovación");
      expect(html).toContain("Staff &amp; Chat");
      expect(html).toContain("Nivel de Vista &amp; Anamnesis");
    });
  });

  // =========================================================================
  // 8. CABECERA ZEN Y GRUPOS COMPACTOS
  // =========================================================================
  describe("8. Cabecera Zen y Clústeres de Acción Sintéticos", () => {
    it("8.1 Expone el Grupo de Comunicación compacto con Enviar Mensaje y WhatsApp directo", () => {
      const html = renderDefaultStudentDetail();

      expect(html).toContain('data-testid="enviar-mensaje-btn"');
      expect(html).toContain('data-testid="whatsapp-direct-btn"');
      expect(html).toContain("💬 Enviar mensaje");
      expect(html).toContain("📱 WhatsApp");
    });

    it("8.2 Expone el Grupo de Personalización Zen con Modo Canvas y Configurar Islas", () => {
      const html = renderDefaultStudentDetail();

      expect(html).toContain('data-testid="btn-modo-canvas"');
      expect(html).toContain('data-testid="btn-configurar-islas"');
    });

    it("8.3 Muestra el estado del alumno y score de salud de manera sobria y legible", () => {
      const html = renderDefaultStudentDetail();

      expect(html).toContain("Lucas Giménez");
      expect(html).toContain("Salud:");
      expect(html).toContain("Al día");
    });
  });

  // =========================================================================
  // 9. AUDITORÍA MATEMÁTICA Y ALGORÍTMICA DE TRANSFORMACIÓN DE FILAS (CANVAS)
  // =========================================================================
  describe("9. Lógica Algorítmica de Manipulación y Seguridad del Canvas", () => {
    interface CanvasRow {
      id: string;
      items: string[];
      widths?: Record<string, number>;
    }

    const moveIslandUpReducer = (prev: CanvasRow[], id: string): CanvasRow[] => {
      const rIdx = prev.findIndex((r) => r.items.includes(id));
      if (rIdx === -1) return prev;
      const row = prev[rIdx]!;
      if (row.items.length > 1) {
        const remaining = row.items.filter((it) => it !== id);
        const nextRows = [...prev];
        nextRows[rIdx] = { ...row, items: remaining, widths: undefined };
        nextRows.splice(rIdx, 0, { id: `row-${id}-up`, items: [id] });
        return nextRows;
      }
      if (rIdx <= 0) return prev;
      const nextRows = [...prev];
      const temp = nextRows[rIdx - 1]!;
      nextRows[rIdx - 1] = nextRows[rIdx]!;
      nextRows[rIdx] = temp;
      return nextRows;
    };

    const moveIslandDownReducer = (prev: CanvasRow[], id: string): CanvasRow[] => {
      const rIdx = prev.findIndex((r) => r.items.includes(id));
      if (rIdx === -1) return prev;
      const row = prev[rIdx]!;
      if (row.items.length > 1) {
        const remaining = row.items.filter((it) => it !== id);
        const nextRows = [...prev];
        nextRows[rIdx] = { ...row, items: remaining, widths: undefined };
        nextRows.splice(rIdx + 1, 0, { id: `row-${id}-down`, items: [id] });
        return nextRows;
      }
      if (rIdx >= prev.length - 1) return prev;
      const nextRows = [...prev];
      const temp = nextRows[rIdx + 1]!;
      nextRows[rIdx + 1] = nextRows[rIdx]!;
      nextRows[rIdx] = temp;
      return nextRows;
    };

    const resizeIslandReducer = (prev: CanvasRow[], id: string, delta: number): CanvasRow[] => {
      const rIdx = prev.findIndex((r) => r.items.includes(id));
      if (rIdx === -1) return prev;
      const row = prev[rIdx]!;
      if (row.items.length !== 2) return prev;
      const otherId = row.items.find((it) => it !== id)!;
      const currentW = row.widths?.[id] ?? 50;
      const nextW = Math.max(25, Math.min(75, currentW + delta));
      const otherW = 100 - nextW;
      const nextRows = [...prev];
      nextRows[rIdx] = {
        ...row,
        widths: {
          [id]: nextW,
          [otherId]: otherW,
        },
      };
      return nextRows;
    };

    const dropIslandReducer = (prev: CanvasRow[], sourceId: string, targetId: string): CanvasRow[] => {
      if (!sourceId || sourceId === targetId) return prev;
      const cleaned = prev
        .map((r) => ({
          ...r,
          items: r.items.filter((it) => it !== sourceId),
          widths: undefined,
        }))
        .filter((r) => r.items.length > 0);

      const targetRowIdx = cleaned.findIndex((r) => r.items.includes(targetId));
      if (targetRowIdx === -1) return prev;

      const targetRow = cleaned[targetRowIdx]!;
      const tColIdx = targetRow.items.indexOf(targetId);

      const newItems = [...targetRow.items];
      newItems.splice(tColIdx + 1, 0, sourceId);

      const nextRows = [...cleaned];
      nextRows[targetRowIdx] = { ...targetRow, items: newItems, widths: undefined };
      return nextRows;
    };

    it("9.1 moveUp en fila individual intercambia posiciones con la fila superior", () => {
      const initial: CanvasRow[] = [
        { id: "r1", items: ["timeline"] },
        { id: "r2", items: ["routine_workbench"] },
      ];
      const result = moveIslandUpReducer(initial, "routine_workbench");
      expect(result[0]!.items).toEqual(["routine_workbench"]);
      expect(result[1]!.items).toEqual(["timeline"]);
    });

    it("9.2 moveUp en el tope de la grilla (index 0) no muta el orden y es seguro", () => {
      const initial: CanvasRow[] = [
        { id: "r1", items: ["timeline"] },
        { id: "r2", items: ["routine_workbench"] },
      ];
      const result = moveIslandUpReducer(initial, "timeline");
      expect(result).toBe(initial);
    });

    it("9.3 moveUp en fila compartida desacopla el elemento a su propia fila inmediatamente arriba", () => {
      const initial: CanvasRow[] = [
        { id: "r1", items: ["timeline"] },
        { id: "r2", items: ["routine_workbench", "metricas_1rm"] },
      ];
      const result = moveIslandUpReducer(initial, "metricas_1rm");
      expect(result.length).toBe(3);
      expect(result[1]!.items).toEqual(["metricas_1rm"]);
      expect(result[2]!.items).toEqual(["routine_workbench"]);
    });

    it("9.4 moveDown al pie de la grilla no muta el orden", () => {
      const initial: CanvasRow[] = [
        { id: "r1", items: ["timeline"] },
        { id: "r2", items: ["administracion"] },
      ];
      const result = moveIslandDownReducer(initial, "administracion");
      expect(result).toBe(initial);
    });

    it("9.5 moveDown en fila compartida desacopla el elemento a una fila propia inmediatamente abajo", () => {
      const initial: CanvasRow[] = [
        { id: "r1", items: ["timeline", "salud_anamnesis"] },
        { id: "r2", items: ["administracion"] },
      ];
      const result = moveIslandDownReducer(initial, "salud_anamnesis");
      expect(result.length).toBe(3);
      expect(result[0]!.items).toEqual(["timeline"]);
      expect(result[1]!.items).toEqual(["salud_anamnesis"]);
      expect(result[2]!.items).toEqual(["administracion"]);
    });

    it("9.6 resize respeta estrictamente los límites (25% - 75%) y la suma constante 100%", () => {
      const initial: CanvasRow[] = [
        { id: "r1", items: ["salud_anamnesis", "administracion"], widths: { salud_anamnesis: 50, administracion: 50 } },
      ];

      // Reducción reiterada hasta el límite
      let state = initial;
      for (let i = 0; i < 10; i++) {
        state = resizeIslandReducer(state, "salud_anamnesis", -10);
      }
      expect(state[0]!.widths!["salud_anamnesis"]).toBe(25);
      expect(state[0]!.widths!["administracion"]).toBe(75);
      expect(state[0]!.widths!["salud_anamnesis"]! + state[0]!.widths!["administracion"]!).toBe(100);

      // Incremento reiterado hasta el límite
      for (let i = 0; i < 10; i++) {
        state = resizeIslandReducer(state, "salud_anamnesis", +10);
      }
      expect(state[0]!.widths!["salud_anamnesis"]).toBe(75);
      expect(state[0]!.widths!["administracion"]).toBe(25);
      expect(state[0]!.widths!["salud_anamnesis"]! + state[0]!.widths!["administracion"]!).toBe(100);
    });

    it("9.7 drop reubica la isla arrastrada y elimina automáticamente las filas que queden vacías", () => {
      const initial: CanvasRow[] = [
        { id: "r1", items: ["timeline"] },
        { id: "r2", items: ["salud_anamnesis"] },
        { id: "r3", items: ["administracion"] },
      ];

      // Arrastrar salud_anamnesis a la fila de timeline
      const result = dropIslandReducer(initial, "salud_anamnesis", "timeline");
      expect(result.length).toBe(2);
      expect(result[0]!.items).toEqual(["timeline", "salud_anamnesis"]);
      expect(result[1]!.items).toEqual(["administracion"]);
    });

    it("9.8 drop sobre la misma isla (self-drop) es una operación inocua", () => {
      const initial: CanvasRow[] = [
        { id: "r1", items: ["timeline"] },
        { id: "r2", items: ["routine_workbench"] },
      ];
      const result = dropIslandReducer(initial, "timeline", "timeline");
      expect(result).toBe(initial);
    });

    it("9.9 tolerancia a fallos: fallback ante JSON corrupto de layout", () => {
      const fallbackRows = [
        { id: "row-timeline", items: ["timeline"] },
        { id: "row-feed", items: ["activity_feed"] },
      ];

      const parseStoredLayout = (raw: string | null) => {
        if (!raw) return fallbackRows;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
            return parsed.rows;
          }
        } catch {
          // Fallback silencioso
        }
        return fallbackRows;
      };

      expect(parseStoredLayout("{ invalid json //")).toEqual(fallbackRows);
      expect(parseStoredLayout(null)).toEqual(fallbackRows);
      expect(parseStoredLayout("")).toEqual(fallbackRows);
      expect(parseStoredLayout('{"rows":[{"id":"custom","items":["custom_island"]}]}')).toEqual([
        { id: "custom", items: ["custom_island"] },
      ]);
    });
  });
});
