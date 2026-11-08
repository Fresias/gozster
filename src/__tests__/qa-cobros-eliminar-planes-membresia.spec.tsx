import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CobrosPanel } from "@/components/coach/cobros-panel";
import { ModalAsignarPlan } from "@/components/coach/modal-asignar-plan";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { getMananaFechaString } from "@/lib/planes";
import { DEMO_ALUMNOS } from "@/services/coach-demo-dataset";

describe("GOZS-420: Finanzas: Eliminación y desactivación de Planes de Membresía en Cobros", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
    useCoachStudioStore.setState({
      alumnos: DEMO_ALUMNOS,
      contrataciones: [],
    });
  });

  describe("Criterio 1: Botón Eliminar en la tabla y diálogo de confirmación accesible", () => {
    it("GIVEN la tabla de planes en CobrosPanel, THEN cada fila cuenta con el botón Eliminar con tokens danger-soft junto a Modificar", () => {
      const html = renderToStaticMarkup(<CobrosPanel />);

      // Verificar existencia de la tabla de planes y botones de acción
      expect(html).toContain('data-testid="planes-table"');
      expect(html).toContain('data-testid="btn-editar-plan-demo-plan-funcional-2x"');
      expect(html).toContain('data-testid="btn-eliminar-plan-demo-plan-funcional-2x"');

      // Tokens de diseño (--danger-soft, rounded-lg)
      expect(html).toContain("text-danger-soft-foreground");
      expect(html).toContain("border-danger-soft-border");
      expect(html).toContain("hover:bg-danger-soft");
      expect(html).toContain("rounded-lg");
    });

    it("GIVEN el diálogo de confirmación, THEN incluye encabezado accesible con el formato '¿Estás seguro de eliminar el plan {nombre}?'", () => {
      const html = renderToStaticMarkup(<CobrosPanel />);

      expect(html).toContain('data-testid="dialog-eliminar-plan"');
      expect(html).toContain('aria-labelledby="eliminar-plan-titulo"');
      expect(html).toContain('data-testid="btn-cancelar-eliminar-plan"');
      expect(html).toContain('data-testid="btn-confirmar-eliminar-plan"');
      expect(html).toContain("¿Estás seguro de eliminar el plan");
    });
  });

  describe("Criterio 2: Eliminación lógica exitosa en useCobrosStore sin contrataciones activas", () => {
    it("GIVEN un plan creado por error (ej. 'CORPO'), WHEN el coach confirma la eliminación, THEN se marca como inactivo (activo: false) y se actualiza el store", async () => {
      const store = useCobrosStore.getState();
      const manana = getMananaFechaString();

      // 1. Alta de plan CORPO a eliminar
      const planCorpo = await store.crearPlan({
        nombre: "Plan CORPO Erróneo",
        actividad: "RUTINAS",
        duracionMeses: 12,
        limiteSemanal: null,
        precio: 0,
        fechaVigencia: manana,
        notas: "Creado por error de tipeo",
      });

      expect(planCorpo).toBeDefined();
      expect(planCorpo.activo).toBe(true);

      // Verificar que está presente y activo inicialmente
      const planAntes = useCobrosStore.getState().planes.find((p) => p.id === planCorpo.id);
      expect(planAntes).toBeDefined();
      expect(planAntes?.activo).toBe(true);

      // 2. Eliminar el plan
      await store.eliminarPlan(planCorpo.id);

      // 3. Verificar estado tras eliminación lógica
      const planDespues = useCobrosStore.getState().planes.find((p) => p.id === planCorpo.id);
      expect(planDespues).toBeDefined();
      expect(planDespues?.activo).toBe(false);

      // 4. Verificar que obtenerPlanesActivos no lo incluye
      const activos = store.obtenerPlanesActivos();
      expect(activos.some((p) => p.id === planCorpo.id)).toBe(false);

      // 5. Verificar aviso de confirmación en el store
      expect(useCobrosStore.getState().aviso).toContain("eliminado correctamente");
      expect(useCobrosStore.getState().error).toBeNull();
    });
  });

  describe("Criterio 3: Salvaguarda de integridad — Rechazo de eliminación si hay alumnos con contrataciones activas", () => {
    it("GIVEN un plan con alumnos que poseen contrataciones vigentes, WHEN se intenta eliminar el plan, THEN arroja error y preserva su estado activo", async () => {
      const store = useCobrosStore.getState();
      const manana = getMananaFechaString();

      // 1. Crear un plan
      const planConAlumnos = await store.crearPlan({
        nombre: "Funcional VIP Activo",
        actividad: "FUNCIONAL",
        duracionMeses: 1,
        limiteSemanal: 3,
        precio: 35000,
        fechaVigencia: manana,
      });

      // 2. Vincular contratación activa para este plan
      useCobrosStore.getState().vincularCobroPlan({
        contratacionId: "contratacion-test-vip",
        alumnoId: "alumno-test-01",
        alumnoNombre: "Atleta Test",
        alumnoEmail: "atleta@test.com",
        servicioNombre: planConAlumnos.nombre,
        monto: 35000,
        diaVencimiento: 10,
        fechaVencimiento: "2027-01-10",
        planId: planConAlumnos.id,
      });

      // 3. Comprobar que tieneContratacionesActivas detecta la vinculación
      expect(store.tieneContratacionesActivas(planConAlumnos.id)).toBe(true);

      // 4. Intentar eliminar el plan debe arrojar excepción
      await expect(store.eliminarPlan(planConAlumnos.id)).rejects.toThrow(
        /tiene alumnos con contrataciones activas/i
      );

      // 5. El plan debe seguir activo en el store
      const planEnStore = useCobrosStore.getState().planes.find((p) => p.id === planConAlumnos.id);
      expect(planEnStore?.activo).toBe(true);
      expect(useCobrosStore.getState().error).toContain("tiene alumnos con contrataciones activas");
    });
  });

  describe("Criterio 4: Exclusión del plan en el dropdown de asignación (ModalAsignarPlan)", () => {
    it("GIVEN un plan eliminado (activo: false), THEN deja de figurar como opción disponible en ModalAsignarPlan", async () => {
      const store = useCobrosStore.getState();
      const manana = getMananaFechaString();

      // 1. Crear plan
      const planEliminar = await store.crearPlan({
        nombre: "Plan Temporal Cancelado",
        actividad: "BOXEO",
        duracionMeses: 1,
        limiteSemanal: 2,
        precio: 22000,
        fechaVigencia: manana,
      });

      // 2. Eliminarlo lógicamente
      await store.eliminarPlan(planEliminar.id);

      // 3. Renderizar ModalAsignarPlan con todos los planes del store
      const planesActuales = useCobrosStore.getState().planes;
      const html = renderToStaticMarkup(
        <ModalAsignarPlan
          abierto={true}
          onCerrar={vi.fn()}
          alumnoId="alumno-1"
          alumnoNombre="Juan Pérez"
          planesDisponibles={planesActuales}
          tienePlanesActivos={false}
          onConfirmar={vi.fn()}
        />
      );

      // Verificar que el select no contiene la opción del plan eliminado
      expect(html).toContain('data-testid="select-plan-asignar"');
      expect(html).not.toContain("Plan Temporal Cancelado");

      // Pero sí contiene los planes activos por defecto
      expect(html).toContain("Funcional 2x semana");
      expect(html).toContain("Pase libre Funcional + Boxeo");
    });
  });
});
