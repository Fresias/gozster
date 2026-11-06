import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IslaRoutineWorkbench } from "@/components/coach/student-detail/islas/isla-routine-workbench";
import type { DiaRutina, Ejercicio, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";

describe("GOZS-383: Coach Studio - Ficha de Alumno: Isla de Rutina Actual (Tabs, Tabla y Dolor Activo)", () => {
  const mockRutina: PlanEntrenamiento = {
    id: "plan-torso-pierna-v2",
    alumno_id: "demo-alumno-lucas",
    profesor_id: "demo-coach-felix",
    nombre: "Hipertrofia Torso-Pierna v2",
    estado: "ACTIVO",
    fecha_inicio: "2026-10-01",
    fecha_fin: "2026-12-31",
    comentarios: "Foco en press banca y sentadilla pesada.",
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
  } as any;

  const mockDias: DiaRutina[] = [
    {
      id: "dia-1-torso-pesado",
      plan_id: "plan-torso-pierna-v2",
      nombre: "Día 1 · Torso pesado",
      orden: 1,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
    {
      id: "dia-2-pierna",
      plan_id: "plan-torso-pierna-v2",
      nombre: "Día 2 · Pierna",
      orden: 2,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
    {
      id: "dia-3-torso-volumen",
      plan_id: "plan-torso-pierna-v2",
      nombre: "Día 3 · Torso volumen",
      orden: 3,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
  ] as any;

  const mockCatalogo: Ejercicio[] = [
    {
      id: "ej-bench-press",
      nombre: "Press de banca plano",
      musculos_principales: ["Pecho"],
      musculos_secundarios: ["Tríceps", "Hombros"],
      comentario: "Press plano tradicional con parada",
      url_video: null,
      creado_por: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "ej-barbell-row",
      nombre: "Remo con barra",
      musculos_principales: ["Espalda"],
      musculos_secundarios: ["Bíceps"],
      comentario: "Remo inclinado a 45 grados",
      url_video: null,
      creado_por: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "ej-hack-squat",
      nombre: "Sentadilla Hack",
      musculos_principales: ["Piernas"],
      musculos_secundarios: ["Glúteos"],
      comentario: "Sentadilla guiada",
      url_video: null,
      creado_por: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "ej-press-militar",
      nombre: "Press militar",
      musculos_principales: ["Hombros"],
      musculos_secundarios: ["Tríceps"],
      comentario: "Press militar de pie",
      url_video: null,
      creado_por: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ] as any;

  const mockEjerciciosEnRutina: EjercicioEnRutina[] = [
    // Día 1: Torso Pesado
    {
      id: "er-bench-press",
      dia_id: "dia-1-torso-pesado",
      ejercicio_id: "ej-bench-press",
      orden: 1,
      series: 4,
      repeticiones: "10-8-6",
      descanso_segundos: 180,
      rpe_objetivo: 8.5,
      notas: "Pausa de 1 s en el pecho",
      es_superserie: false,
      grupo_superserie: null,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
    {
      id: "er-barbell-row",
      dia_id: "dia-1-torso-pesado",
      ejercicio_id: "ej-barbell-row",
      orden: 2,
      series: 4,
      repeticiones: "10",
      descanso_segundos: 120,
      rpe_objetivo: 8,
      notas: "Torso a 45°",
      es_superserie: false,
      grupo_superserie: null,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
    // Día 2: Pierna
    {
      id: "er-hack-squat",
      dia_id: "dia-2-pierna",
      ejercicio_id: "ej-hack-squat",
      orden: 1,
      series: 3,
      repeticiones: "8-10",
      descanso_segundos: 150,
      rpe_objetivo: 9,
      notas: "Pausa en el fondo",
      es_superserie: false,
      grupo_superserie: null,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
    // Día 3: Torso Volumen (con Superserie)
    {
      id: "er-press-militar",
      dia_id: "dia-3-torso-volumen",
      ejercicio_id: "ej-press-militar",
      orden: 1,
      series: 3,
      repeticiones: "8-12",
      descanso_segundos: 90,
      rpe_objetivo: 8,
      notas: "Glúteos apretados",
      es_superserie: true,
      grupo_superserie: 1,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
  ] as any;

  const mockHistoricalLoads = [
    {
      sesion: {
        id: "ses-1",
        alumno_id: "demo-alumno-lucas",
        plan_id: "plan-torso-pierna-v2",
        dia_id: "dia-1-torso-pesado",
        fecha: "2026-11-04T18:00:00Z",
        duracion_minutos: 65,
        created_at: "2026-11-04T18:00:00Z",
        updated_at: "2026-11-04T18:00:00Z",
      },
      series: [
        {
          id: "serie-1",
          registro_sesion_id: "ses-1",
          ejercicio_id: "ej-bench-press",
          ejercicioNombre: "Press de banca plano",
          numero_serie: 1,
          peso_utilizado_kg: 77.5,
          repeticiones_hechas: 8,
          rpe_real: 8.5,
          descanso_segundos: 180,
          created_at: "2026-11-04T18:00:00Z",
        },
        {
          id: "serie-2",
          registro_sesion_id: "ses-1",
          ejercicio_id: "ej-barbell-row",
          ejercicioNombre: "Remo con barra",
          numero_serie: 1,
          peso_utilizado_kg: 60,
          repeticiones_hechas: 10,
          rpe_real: 8,
          descanso_segundos: 120,
          created_at: "2026-11-04T18:00:00Z",
        },
      ],
    },
  ] as any;

  const mockAlertasDolor = [
    {
      id: "alerta-dolor-hombro",
      ejercicioId: "ej-bench-press",
      ejercicioNombre: "Press de banca plano",
      zona: "Hombro",
      zona_articular: "HOMBRO",
      detalle: "Molestia en cara anterior al descender la barra",
      severidad: "ALTA",
      estado: "PENDIENTE",
      resolved: false,
    },
  ] as any;

  describe("1. Estructura de pestañas accesibles: 'Actual', 'Historial', 'Registros'", () => {
    it("renderiza tablist con pestañas accesibles que identifican Rutina actual, Historial y Registros", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('aria-label="Pestañas de la rutina del alumno"');
      expect(html).toContain("Rutina actual");
      expect(html).toContain("Historial");
      expect(html).toContain("Registros");
      expect(html).toContain('data-testid="tab-registros-sesiones"');
      expect(html).toContain('data-testid="workbench-actual-panel"');
    });

    it("conmuta al panel de Historial cuando activeTab es 'historial_rutinas' o 'historial'", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          activeTab="historial_rutinas"
          historialPlanes={[mockRutina]}
        />
      );

      expect(html).toContain('data-testid="workbench-historial-panel"');
      expect(html).not.toContain('data-testid="workbench-actual-panel"');
    });

    it("conmuta al panel de Registros cuando activeTab es 'registros_sesiones' o 'registros'", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          activeTab="registros_sesiones"
          historialCargas={mockHistoricalLoads}
        />
      );

      expect(html).toContain('data-testid="panel-registros-sesiones"');
      expect(html).not.toContain('data-testid="workbench-actual-panel"');
    });
  });

  describe("2. Criterio de Aceptación Gherkin: Navegación de Días por Chips", () => {
    it("GIVEN un alumno con rutina asignada de 3 días, WHEN se visualiza el Día 1, THEN muestra las series, reps y descanso correspondientes", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          selectedDiaId="dia-1-torso-pesado"
        />
      );

      expect(html).toContain("Día 1 · Torso pesado");
      expect(html).toContain("Día 2 · Pierna");
      expect(html).toContain("Día 3 · Torso volumen");

      // Ejercicios del Día 1 presentes
      expect(html).toContain("Press de banca plano");
      expect(html).toContain("Remo con barra");
      expect(html).toContain("4 × 10-8-6");
      expect(html).toContain("4 × 10");
      expect(html).toContain("3 min");
      expect(html).toContain("2 min");

      // Ejercicios de otros días NO presentes en este día
      expect(html).not.toContain("Sentadilla Hack");
      expect(html).not.toContain("Press militar");
    });

    it("WHEN se navega al Día 2, THEN la tabla se actualiza mostrando las series, repeticiones y descanso de ese día", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          selectedDiaId="dia-2-pierna"
        />
      );

      // Ejercicio del Día 2 presente
      expect(html).toContain("Sentadilla Hack");
      expect(html).toContain("3 × 8-10");
      expect(html).toContain("150 s");

      // Ejercicios del Día 1 NO presentes
      expect(html).not.toContain("Press de banca plano");
      expect(html).not.toContain("Remo con barra");
    });

    it("WHEN se navega al Día 3, THEN muestra los ejercicios de ese día y el conector de superserie", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          selectedDiaId="dia-3-torso-volumen"
        />
      );

      expect(html).toContain("Press militar");
      expect(html).toContain("3 × 8-12");
      expect(html).toContain("90 s");
      expect(html).toContain('data-testid="workbench-superserie-connector"');
      expect(html).toContain("Superserie G1");
    });
  });

  describe("3. Criterio de Aceptación Gherkin: Resaltado Semántico de Dolor Activo", () => {
    it("GIVEN un ejercicio con reporte de dolor activo asociado, THEN su fila en la tabla de rutina presenta fondo de advertencia sutil y badge 'Dolor activo'", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          selectedDiaId="dia-1-torso-pesado"
          alertasDolor={mockAlertasDolor}
          historialCargas={mockHistoricalLoads}
        />
      );

      // Verificación de badge 'Dolor activo'
      expect(html).toContain("Dolor activo");

      // Verificación de estilo de advertencia suave (amber)
      expect(html).toContain("bg-amber-500/10");
      expect(html).toContain("border-l-4 border-l-amber-500");

      // Detalle de la molestia reportada
      expect(html).toContain("Dolor de hombro activo");

      // Nota del coach con aviso de dolor activo en la rutina
      expect(html).toContain("La fila resaltada tiene una alerta de dolor activa.");
    });
  });

  describe("4. Criterio de Aceptación Gherkin: Botón Quick Swap y Apertura de Modal", () => {
    it("GIVEN el botón Quick Swap en una fila con dolor, WHEN se renderiza, THEN expone el botón accesible", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          selectedDiaId="dia-1-torso-pesado"
          alertasDolor={mockAlertasDolor}
        />
      );

      expect(html).toContain('data-testid="workbench-quick-swap-btn"');
      expect(html).toContain("Quick Swap");
    });

    it("GIVEN el modal Quick Swap abierto para el ejercicio afectado, THEN exhibe el diálogo preseleccionando el ejercicio con reporte de dolor", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          selectedDiaId="dia-1-torso-pesado"
          alertasDolor={mockAlertasDolor}
          initialQuickSwapOpen={true}
          initialQuickSwapExercise="Press de banca plano"
        />
      );

      expect(html).toContain('data-testid="quick-swap-modal"');
      expect(html).toContain('data-testid="biomechanical-safety-notice"');
      expect(html).toContain("Sustituir Ejercicio por Molestia Articular");
      expect(html).toContain("Press de banca plano");
    });
  });

  describe("5. Telemetría de Cargas, Micro-tabla y Regla Ponytail", () => {
    it("muestra columnas completas de series x reps, última carga, descanso y RPE", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina}
          dias={mockDias}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          selectedDiaId="dia-1-torso-pesado"
          historialCargas={mockHistoricalLoads}
        />
      );

      // Micro-tabla headers
      expect(html).toContain("Ejercicio");
      expect(html).toContain("Series × reps");
      expect(html).toContain("Última carga");
      expect(html).toContain("Descanso");
      expect(html).toContain("RPE");

      // Valores de última carga
      expect(html).toContain("77,5 kg");
      expect(html).toContain("60 kg");

      // RPE
      expect(html).toContain("8,5");
      expect(html).toContain("8");
    });

    it("soporta estado vacío accesible cuando el alumno no posee rutina activa", () => {
      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={null}
          dias={[]}
          ejerciciosEnRutina={[]}
          ejerciciosCatalogo={mockCatalogo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      expect(html).toContain("Sin rutina activa");
      expect(html).toContain("El alumno no cuenta con una rutina activa actualmente.");
    });
  });
});
