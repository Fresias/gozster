import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/studio/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { ProgressiveOverloadFeed } from "@/components/coach/progressive-overload-feed";
import {
  alumnoTieneActividad,
  derivarLabelsActividadAlumno,
  obtenerActividadesAlumno,
} from "@/lib/alumno-actividades";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useCobrosStore } from "@/store/use-cobros-store";
import { render, fireEvent } from "@/test-utils/no-demo-literals";
import type {
  AlumnoActividad,
  Contratacion,
  Perfil,
  PlanEntrenamiento,
  PlanMembresia,
} from "@/types/database.types";

const ALU_BOX_RUT = "aaaa1111-1111-4111-8111-111111111111";
const ALU_PLAN_ONLY = "aaaa2222-2222-4222-8222-222222222222";
const ALU_INACTIVO = "aaaa3333-3333-4333-8333-333333333333";
const ALU_LIBRE = "aaaa4444-4444-4444-8444-444444444444";
const COACH_ID = "bbbb1111-1111-4111-8111-111111111111";
const PLAN_LIBRE_UUID = "cccc1111-1111-4111-8111-111111111111";

function makeAlumno(id: string, nombre: string, email: string): Perfil {
  return {
    id,
    nombre_completo: nombre,
    email,
    telefono: null,
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: COACH_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: null,
    ultimo_entreno_at: null,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
  };
}

describe("GOZS-654 / GOZS-655: Labels B/F/P en /studio/dashboard, selector reactivo y filtro sin fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCobrosStore.getState().resetDemoDataset();
    useCoachStudioStore.setState({
      alumnos: [],
      planes: [],
      dias: [],
      ejerciciosEnRutina: [],
      ejercicios: [],
      contrataciones: [],
      alumnoActividades: [],
      filtroActividad: "TODAS",
      isLiveDatabase: true,
    });
  });

  it("obtenerActividadesAlumno devuelve [] para alumno sin actividad, sin contratación y sin plan activo", () => {
    const acts = obtenerActividadesAlumno({
      alumnoId: ALU_INACTIVO,
      alumnoActividades: [],
      contrataciones: [],
      planes: [],
    });
    expect(acts).toEqual([]);

    expect(
      alumnoTieneActividad({
        alumnoId: ALU_INACTIVO,
        actividad: "TODAS",
        alumnoActividades: [],
        contrataciones: [],
        planes: [],
      }),
    ).toBe(true);
    expect(
      alumnoTieneActividad({
        alumnoId: ALU_INACTIVO,
        actividad: "RUTINAS",
        alumnoActividades: [],
        contrataciones: [],
        planes: [],
      }),
    ).toBe(false);
    expect(
      alumnoTieneActividad({
        alumnoId: ALU_INACTIVO,
        actividad: "BOXEO",
        alumnoActividades: [],
        contrataciones: [],
        planes: [],
      }),
    ).toBe(false);
    expect(
      alumnoTieneActividad({
        alumnoId: ALU_INACTIVO,
        actividad: "FUNCIONAL",
        alumnoActividades: [],
        contrataciones: [],
        planes: [],
      }),
    ).toBe(false);
  });

  it("GIVEN alumno con BOXEO y RUTINAS en alumno_actividades y otro con solo plan ACTIVO WHEN se abre /studio/dashboard THEN muestra B+P y P neutros", () => {
    const gabriel = makeAlumno(ALU_BOX_RUT, "Gabriel Sanchez", "gabriel@test.local");
    const soloPlan = makeAlumno(ALU_PLAN_ONLY, "María Rutina", "maria@test.local");
    const acts: AlumnoActividad[] = [
      {
        id: "aa-box",
        alumno_id: ALU_BOX_RUT,
        actividad: "BOXEO",
        veces_por_semana: 2,
        pase_libre: false,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      },
      {
        id: "aa-rut",
        alumno_id: ALU_BOX_RUT,
        actividad: "RUTINAS",
        veces_por_semana: null,
        pase_libre: false,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      },
    ];
    const planActivo: PlanEntrenamiento = {
      id: "plan-only-1",
      alumno_id: ALU_PLAN_ONLY,
      nombre: "Hipertrofia Base",
      estado: "ACTIVO",
      profesor_id: COACH_ID,
      fecha_inicio: "2026-11-01",
      fecha_fin: "2026-12-01",
      comentarios: null,
      created_at: "2026-11-01T10:00:00Z",
      updated_at: "2026-11-01T10:00:00Z",
    };

    const { container, unmount } = render(
      <CoachDashboardView
        initialDataset={{
          alumnos: [gabriel, soloPlan],
          planes: [planActivo],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
          alumnoActividades: acts,
          contrataciones: [],
          planesMembresia: [],
          cobros: [],
        }}
        estancados={[
          { alumnoId: ALU_BOX_RUT, diasSinPR: 35 },
          { alumnoId: ALU_PLAN_ONLY, diasSinPR: 40 },
        ]}
      />,
    );

    const html = container.innerHTML;
    expect(html).toContain('data-testid="activity-label-B"');
    expect(html).toContain('data-testid="activity-label-P"');
    expect(html).not.toContain('data-testid="activity-label-F"');
    expect(html).toContain("border-border bg-transparent");
    expect(html).toContain('title="Boxeo"');
    expect(html).toContain('aria-label="Boxeo"');
    expect(html).toContain('title="Plan / Rutina asignada"');
    expect(html).toContain('aria-label="Plan / Rutina asignada"');
    unmount();
  });

  it("GIVEN alumno sin actividad WHEN se filtra por 'Rutina online' THEN no se cuenta ni aparece, y alumno con BOXEO aparece en filtro Boxeo", () => {
    const gabriel = makeAlumno(ALU_BOX_RUT, "Gabriel Sanchez", "gabriel@test.local");
    const inactivo = makeAlumno(ALU_INACTIVO, "Pedro Inactivo", "pedro@test.local");
    const acts: AlumnoActividad[] = [
      {
        id: "aa-g-box",
        alumno_id: ALU_BOX_RUT,
        actividad: "BOXEO",
        veces_por_semana: 2,
        pase_libre: false,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      },
      {
        id: "aa-g-rut",
        alumno_id: ALU_BOX_RUT,
        actividad: "RUTINAS",
        veces_por_semana: null,
        pase_libre: false,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      },
    ];

    const dashboard = render(
      <CoachDashboardView
        initialDataset={{
          alumnos: [gabriel, inactivo],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
          alumnoActividades: acts,
          contrataciones: [],
          planesMembresia: [],
          cobros: [],
        }}
        estancados={[{ alumnoId: ALU_INACTIVO, diasSinPR: 31 }]}
      />,
    );

    expect(dashboard.getByTestId("filtro-actividad-todas").textContent).toContain("Todas (2)");
    expect(dashboard.getByTestId("filtro-actividad-boxeo").textContent).toContain("Boxeo (1)");
    expect(dashboard.getByTestId("filtro-actividad-rutinas").textContent).toContain("Rutina online (1)");
    expect(dashboard.container.innerHTML).not.toContain('data-testid="activity-label-');
    dashboard.unmount();

    // En /studio, filtrar por Boxeo muestra a Gabriel y oculta a Pedro; filtrar por Rutina online oculta a Pedro
    useCoachStudioStore.setState({ filtroActividad: "BOXEO" });
    const studioBoxeo = render(
      <CoachStudioView
        initialAlumnosExpanded={true}
        initialDataset={{
          alumnos: [gabriel, inactivo],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
          alumnoActividades: acts,
          contrataciones: [],
          planesMembresia: [],
          cobros: [],
        }}
      />,
    );
    expect(studioBoxeo.container.innerHTML).toContain('aria-label="Ver ficha de Gabriel Sanchez"');
    expect(studioBoxeo.container.innerHTML).not.toContain('aria-label="Ver ficha de Pedro Inactivo"');
    expect(studioBoxeo.container.textContent).toContain("Mostrando 1 de 1");
    studioBoxeo.unmount();

    useCoachStudioStore.setState({ filtroActividad: "RUTINAS" });
    const studioRutinas = render(
      <CoachStudioView
        initialAlumnosExpanded={true}
        initialDataset={{
          alumnos: [gabriel, inactivo],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
          alumnoActividades: acts,
          contrataciones: [],
          planesMembresia: [],
          cobros: [],
        }}
      />,
    );
    expect(studioRutinas.container.innerHTML).toContain('aria-label="Ver ficha de Gabriel Sanchez"');
    expect(studioRutinas.container.innerHTML).not.toContain('aria-label="Ver ficha de Pedro Inactivo"');
    expect(studioRutinas.container.textContent).toContain("Mostrando 1 de 1");
    studioRutinas.unmount();
  });

  it("GIVEN useCobrosStore.planes se hidrata después del primer render WHEN cambia THEN los labels en /studio/dashboard y /studio se recalculan", async () => {
    const alumnoLibre = makeAlumno(ALU_LIBRE, "Sofía Libre", "sofia.libre@test.local");
    const contratoLibre: Contratacion = {
      id: "cont-libre-real",
      alumno_id: ALU_LIBRE,
      plan_membresia_id: PLAN_LIBRE_UUID,
      actividad: null,
      tipo_servicio: "PRESENCIAL",
      precio_pactado: 45000,
      estado: "VIGENTE",
      dia_vencimiento: 10,
      dias_aviso_previo: 5,
      fecha_inicio: "2026-11-01",
      fecha_fin: "2026-12-01",
      created_at: "2026-11-01T10:00:00Z",
      updated_at: "2026-11-01T10:00:00Z",
    };
    const planMembresiaReal: PlanMembresia = {
      id: PLAN_LIBRE_UUID,
      nombre: "Pase Libre",
      limite_semanal: null,
      cantidad_actividades: 2,
      duracion_meses: 1,
      precio: 45000,
      activo: true,
      created_at: "2026-11-01T10:00:00Z",
      updated_at: "2026-11-01T10:00:00Z",
    };

    const dashboard = render(
      <CoachDashboardView
        initialDataset={{
          alumnos: [alumnoLibre],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
          alumnoActividades: [],
          contrataciones: [contratoLibre],
          planesMembresia: [],
          cobros: [],
        }}
        estancados={[{ alumnoId: ALU_LIBRE, diasSinPR: 33 }]}
      />,
    );

    expect(dashboard.container.innerHTML).not.toContain('data-testid="activity-label-B"');
    expect(dashboard.container.innerHTML).not.toContain('data-testid="activity-label-F"');

    await new Promise((r) => setTimeout(r, 20));
    useCobrosStore.setState({
      planes: [planMembresiaReal],
    });

    expect(dashboard.container.innerHTML).toContain('data-testid="activity-label-B"');
    expect(dashboard.container.innerHTML).toContain('data-testid="activity-label-F"');
    dashboard.unmount();

    // Repetir verificación reactiva en CoachStudioView (/studio)
    useCobrosStore.getState().resetDemoDataset();
    useCoachStudioStore.setState({
      alumnos: [],
      planes: [],
      contrataciones: [],
      alumnoActividades: [],
      filtroActividad: "TODAS",
      isLiveDatabase: true,
    });

    const studio = render(
      <CoachStudioView
        initialAlumnosExpanded={true}
        initialDataset={{
          alumnos: [alumnoLibre],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
          alumnoActividades: [],
          contrataciones: [contratoLibre],
          planesMembresia: [],
          cobros: [],
        }}
      />,
    );

    expect(studio.container.innerHTML).not.toContain('data-testid="activity-label-B"');
    await new Promise((r) => setTimeout(r, 20));
    useCobrosStore.setState({
      planes: [planMembresiaReal],
    });

    expect(studio.container.innerHTML).toContain('data-testid="activity-label-B"');
    expect(studio.container.innerHTML).toContain('data-testid="activity-label-F"');
    studio.unmount();
  });

  it("AssignPlanModal dentro de CoachDashboardView muestra ActivityLabels del alumno sin plan", () => {
    const alumnoBox = makeAlumno(ALU_BOX_RUT, "Lucas Box", "lucas.box@test.local");
    const acts: AlumnoActividad[] = [
      {
        id: "aa-modal-box",
        alumno_id: ALU_BOX_RUT,
        actividad: "BOXEO",
        veces_por_semana: 2,
        pase_libre: false,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      },
    ];
    useCoachStudioStore.setState({
      alumnos: [alumnoBox],
      planes: [],
      alumnoActividades: acts,
      contrataciones: [],
      isLiveDatabase: true,
    });

    const view = render(
      <CoachDashboardView
        initialDataset={{
          alumnos: [alumnoBox],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
          alumnoActividades: acts,
          contrataciones: [],
          planesMembresia: [],
          cobros: [],
        }}
      />,
    );

    const assignBtn = view.getByLabelText("Asignar rutina a alumnos sin plan");
    fireEvent.click(assignBtn);

    expect(view.container.innerHTML).toContain("Asignación Urgente de Rutina");
    expect(view.container.innerHTML).toContain('data-testid="activity-label-B"');
    view.unmount();
  });

  it("ProgressiveOverloadFeed muestra ActivityLabels junto al nombre del alumno cuando recibe getLabelsAlumno", () => {
    const acts: AlumnoActividad[] = [
      {
        id: "aa-feed-box",
        alumno_id: ALU_BOX_RUT,
        actividad: "BOXEO",
        veces_por_semana: 2,
        pase_libre: false,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      },
    ];
    const feed = render(
      <ProgressiveOverloadFeed
        alertas={[
          {
            id: "alerta-test-1",
            alumnoId: ALU_BOX_RUT,
            alumnoNombre: "Gabriel Sanchez",
            ejercicioId: "ej-1",
            ejercicioNombre: "Press de Banca",
            sesionId: "ses-1",
            fecha: "2026-11-20T10:00:00Z",
            pesoMaxKg: 80,
            pesoPrevioKg: 75,
            deltaPesoKg: 5,
            volumenEjercicioKg: 2400,
            volumenPrevioKg: 2200,
            deltaVolumenKg: 200,
            mejor1rmEpley: 96,
            mejor1rmBrzycki: 95,
            esNuevoRecord1RM: true,
            tipo: "RECORD_1RM",
          },
        ]}
        onSelectAlumno={vi.fn()}
        onOpenHistoricalLoads={vi.fn()}
        getLabelsAlumno={(id) =>
          derivarLabelsActividadAlumno({
            alumnoId: id,
            alumnoActividades: acts,
            contrataciones: [],
            planes: [],
          })
        }
      />,
    );

    expect(feed.container.textContent).toContain("Gabriel Sanchez");
    expect(feed.container.innerHTML).toContain('data-testid="activity-label-B"');
    feed.unmount();
  });
});
