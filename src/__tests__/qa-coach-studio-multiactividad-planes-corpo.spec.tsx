import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CobrosPanel } from "@/components/coach/cobros-panel";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { StudentDetail } from "@/components/coach/student-detail";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { derivarBadgePlan, formatearNombreCortoPlan, getMananaFechaString } from "@/lib/planes";
import type { Perfil } from "@/types/database.types";
import { DEMO_ALUMNOS } from "@/services/coach-demo-dataset";

describe("GOZS-362: Coach Studio: Alta de Planes $0 con Notas, Asignación Multiactividad y Badges Apilables", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
    useCoachStudioStore.setState({
      alumnos: DEMO_ALUMNOS,
      contrataciones: [],
    });
  });

  describe("Criterio 1: Alta y Edición de Plan CORPO a $0 con Notas (cobros-panel.tsx)", () => {
    it("GIVEN el formulario de nuevo plan de membresía en Cobros, WHEN el coach ingresa un plan con actividad 'Rutinas Online', precio $0 y una nota descriptiva, THEN el plan se guarda exitosamente sin exigir cupo semanal de clases", async () => {
      const store = useCobrosStore.getState();
      const manana = getMananaFechaString();

      // Alta de plan CORPO a $0
      const planCorpo = await store.crearPlan({
        nombre: "Rutinas Online CORPO",
        actividad: "RUTINAS",
        duracionMeses: 12,
        limiteSemanal: null, // Rutinas no exige cupo semanal
        precio: 0,
        fechaVigencia: manana,
        notas: "Convenio Corporativo TechCorp - 100% Bonificado",
      });

      expect(planCorpo).toBeDefined();
      expect(planCorpo.precio).toBe(0);
      expect(planCorpo.limite_semanal).toBeNull();
      expect(planCorpo.actividad_tipo).toBe("RUTINAS");
      expect(planCorpo.notas).toBe("Convenio Corporativo TechCorp - 100% Bonificado");

      // Verificamos que se listó en el store de planes
      const planesActuales = useCobrosStore.getState().planes;
      const encontrado = planesActuales.find((p) => p.id === planCorpo.id);
      expect(encontrado).toBeDefined();
      expect(encontrado?.precio).toBe(0);
      expect(encontrado?.notas).toContain("TechCorp");
    });

    it("GIVEN el render de CobrosPanel, THEN contiene el campo de notas, permite precio min=0 y selector de actividad RUTINAS", () => {
      const html = renderToStaticMarkup(<CobrosPanel />);

      expect(html).toContain('data-testid="input-plan-precio"');
      expect(html).toContain('min="0"');
      expect(html).toContain('data-testid="input-plan-notas"');
      expect(html).toContain('data-testid="select-plan-actividad"');
      expect(html).toContain('value="RUTINAS"');
      expect(html).toContain('data-testid="btn-cambiar-plan-cobros"');
    });
  });

  describe("Criterio 2: Ficha de Alumno en student-detail.tsx y Asignación Multiactividad", () => {
    it("GIVEN la ficha de un alumno en student-detail.tsx, WHEN el coach presiona la acción para vincular un plan adicional, THEN puede vincular un plan adicional sin revocar el plan existente", async () => {
      const alumnoTest: Perfil = DEMO_ALUMNOS[0]!;
      const studioStore = useCoachStudioStore.getState();
      const cobrosStore = useCobrosStore.getState();

      // 1. Crear un plan corporativo a $0 en Cobros
      const manana = getMananaFechaString();
      const planCorpo = await cobrosStore.crearPlan({
        nombre: "Rutinas Online CORPO",
        actividad: "RUTINAS",
        duracionMeses: 6,
        limiteSemanal: null,
        precio: 0,
        fechaVigencia: manana,
        notas: "Convenio Gimnasio + Empresa",
      });

      // 2. Vincular el plan como adicional (multiactividad)
      const contratacionVinculada = await studioStore.vincularPlanMembresiaAlumno({
        alumnoId: alumnoTest.id,
        planId: planCorpo.id,
        esAdicional: true,
        notas: "Beca corporativa",
      });

      expect(contratacionVinculada).toBeDefined();
      expect(contratacionVinculada.alumno_id).toBe(alumnoTest.id);
      expect(contratacionVinculada.precio_pactado).toBe(0);
      expect(contratacionVinculada.estado).toBe("VIGENTE");

      // 3. Comprobar que el alumno ahora tiene sus contrataciones activas (sin revocar existentes)
      const contrataciones = useCoachStudioStore.getState().getContratacionesAlumno(alumnoTest.id);
      expect(contrataciones.length).toBeGreaterThanOrEqual(1);
      const tieneCorpo = contrataciones.some((c) => c.plan_membresia_id === planCorpo.id);
      expect(tieneCorpo).toBe(true);

      // 4. Renderizar StudentDetail y verificar desglose multiactividad
      const html = renderToStaticMarkup(
        <StudentDetail
          alumno={alumnoTest}
          activeTab="RESUMEN"
          onTabChange={vi.fn()}
          onBack={vi.fn()}
          rutinaActiva={null}
          historialPlanes={[]}
          dias={[]}
          ejerciciosEnRutina={[]}
          ejerciciosCatalogo={[]}
          onOpenHistoricalLoads={vi.fn()}
          onClonarUltimaRutina={vi.fn().mockResolvedValue(null)}
          onExtenderVigencia={vi.fn().mockResolvedValue(null)}
          isOffline={false}
        />
      );

      expect(html).toContain('data-testid="membresia-clases-panel"');
      expect(html).toContain('data-testid="btn-asignar-nuevo-plan"');
      expect(html).toContain('data-testid="item-plan-desglose"');
      expect(html).toContain("Planes de Membresía &amp; Multiactividad");
    });
  });

  describe("Criterio 3: Tabla Matriz de Atletas en /studio con Badges Apilables", () => {
    it("GIVEN un alumno con dos planes activos en simultáneo, WHEN se lista en la tabla de atletas de /studio, THEN la columna de estado exhibe los badges apilados correspondientes a cada plan", async () => {
      const alumnoTest: Perfil = DEMO_ALUMNOS[0]!;
      const studioStore = useCoachStudioStore.getState();
      const cobrosStore = useCobrosStore.getState();

      const manana = getMananaFechaString();

      // Plan 1: Pase Libre ($40.000)
      const planPaseLibre = await cobrosStore.crearPlan({
        nombre: "Pase Libre Funcional + Boxeo",
        actividad: "FUNCIONAL_BOXEO",
        duracionMeses: 1,
        limiteSemanal: null,
        precio: 40000,
        fechaVigencia: manana,
      });

      // Plan 2: CORPO ($0)
      const planCorpo = await cobrosStore.crearPlan({
        nombre: "Rutinas Online CORPO",
        actividad: "RUTINAS",
        duracionMeses: 12,
        limiteSemanal: null,
        precio: 0,
        fechaVigencia: manana,
        notas: "Convenio Corporativo $0",
      });

      // Asignar Plan 1 (principal)
      await studioStore.vincularPlanMembresiaAlumno({
        alumnoId: alumnoTest.id,
        planId: planPaseLibre.id,
        esAdicional: false,
      });

      // Asignar Plan 2 (adicional / multiactividad)
      await studioStore.vincularPlanMembresiaAlumno({
        alumnoId: alumnoTest.id,
        planId: planCorpo.id,
        esAdicional: true,
      });

      // Verificamos que el alumno tiene ambos planes activos en el store
      const contrataciones = useCoachStudioStore.getState().getContratacionesAlumno(alumnoTest.id);
      expect(contrataciones.length).toBe(2);

      // Renderizar CoachStudioView con la tabla expandida
      const html = renderToStaticMarkup(<CoachStudioView initialAlumnosExpanded={true} />);

      expect(html).toContain('data-testid="columna-cuota-actividad"');
      expect(html).toContain('data-testid="badges-planes-apilados"');
      expect(html).toContain('data-testid="badge-plan-apilado"');

      // Comprobar presencia de ambos badges
      expect(html).toContain("Pase Libre: Al día");
      expect(html).toContain("CORPO: $0");
    });
  });

  describe("Criterio 4: ModalAsignarPlan y Modificación de Plan con Notas", () => {
    it("GIVEN un plan existente, WHEN el coach lo modifica a $0 con notas descriptivas, THEN se actualiza correctamente en el store", async () => {
      const store = useCobrosStore.getState();
      const planOriginal = store.planes[0]!;
      const manana = getMananaFechaString();

      const modificado = await store.modificarPlan({
        planId: planOriginal.id,
        nombre: `${planOriginal.nombre} (Beca)`,
        precio: 0,
        fechaVigencia: manana,
        notas: "Acuerdo beca 100% Gabriel",
      });

      expect(modificado.precio).toBe(0);
      expect(modificado.notas).toBe("Acuerdo beca 100% Gabriel");
      expect(modificado.nombre).toContain("(Beca)");

      const enStore = useCobrosStore.getState().planes.find((p) => p.id === planOriginal.id);
      expect(enStore?.precio).toBe(0);
      expect(enStore?.notas).toBe("Acuerdo beca 100% Gabriel");
    });
  });

  describe("Helper derivarBadgePlan y formatearNombreCortoPlan", () => {
    it("abrevia nombres de plan y formatea correctamente badges $0, Al día y Vencida", () => {
      expect(formatearNombreCortoPlan("Rutinas Online CORPO")).toBe("CORPO");
      expect(formatearNombreCortoPlan("Pase Libre Funcional + Boxeo")).toBe("Pase Libre");
      expect(formatearNombreCortoPlan("Funcional 2x semana")).toBe("Funcional 2x");
      expect(formatearNombreCortoPlan("Boxeo 3x")).toBe("Boxeo");

      // Badge CORPO $0
      const badge0 = derivarBadgePlan({
        nombrePlan: "Rutinas Online CORPO",
        precio: 0,
        esVigente: true,
        esAlDia: true,
      });
      expect(badge0.label).toBe("CORPO: $0");
      expect(badge0.esGratis).toBe(true);
      expect(badge0.className).toContain("cyan");

      // Badge Al día
      const badgeAlDia = derivarBadgePlan({
        nombrePlan: "Pase Libre Funcional",
        precio: 40000,
        esVigente: true,
        esAlDia: true,
      });
      expect(badgeAlDia.label).toBe("Pase Libre: Al día");
      expect(badgeAlDia.esGratis).toBe(false);
      expect(badgeAlDia.className).toContain("emerald");

      // Badge Vencida
      const badgeVencida = derivarBadgePlan({
        nombrePlan: "Funcional 2x",
        precio: 25000,
        esVigente: false,
        esAlDia: false,
      });
      expect(badgeVencida.label).toBe("Funcional 2x: Vencida");
      expect(badgeVencida.className).toContain("rose");
    });
  });
});
