import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/studio",
  useSearchParams: () => new URLSearchParams(),
}));

import { ActivityLabels } from "@/components/coach/activity-labels";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { CobrosPanel } from "@/components/coach/cobros-panel";
import { InviteStudentModal } from "@/components/coach/invite-student-modal";
import { ModalAsignarPlan } from "@/components/coach/modal-asignar-plan";
import { StudentDetail } from "@/components/coach/student-detail";
import { IslaAdministrativa } from "@/components/coach/student-detail/islas/isla-administrativa";
import { derivarLabelsActividadAlumno } from "@/lib/alumno-actividades";
import { supabase } from "@/lib/supabase/client";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useCobrosStore, ultimaSuscripcionPorContrato } from "@/store/use-cobros-store";
import type { AlumnoActividad, Contratacion, Perfil, PlanEntrenamiento } from "@/types/database.types";

const ALU_1 = "11111111-1111-4111-8111-111111111111";
const ALU_2 = "22222222-2222-4222-8222-222222222222";
const COACH_ID = "33333333-3333-4333-8333-333333333333";
const PLAN_FUNC_ID = "44444444-4444-4444-8444-444444444441";
const PLAN_BOX_ID = "44444444-4444-4444-8444-444444444442";

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

describe("GOZS-642: Cobros reales Supabase, sin fallback Ficha, precio editable + Pagó y labels B/F/P", () => {
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
      isLiveDatabase: true,
    });
  });

  describe("1. Sin fallback engañoso en Ficha e IslaAdministrativa", () => {
    it("GIVEN un alumno sin plan comercial asignado WHEN se abre su Ficha THEN muestra 'Sin plan asignado' y nunca 'Pase libre · Funcional + Boxeo' ni '$40.000'", () => {
      useCobrosStore.setState({ cobros: [], planes: [], isLiveMode: true });
      const alumnoSinPlan = makeAlumno(ALU_1, "Carlos SinPlan", "carlos@test.local");

      const htmlIsla = renderToStaticMarkup(
        <IslaAdministrativa
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          onAsignarPlan={vi.fn()}
        />,
      );
      expect(htmlIsla).toContain("Sin plan asignado");
      expect(htmlIsla).toContain('data-testid="btn-asignar-plan-desde-membresia"');
      expect(htmlIsla).not.toContain("Pase libre · Funcional + Boxeo");
      expect(htmlIsla).not.toContain("$40.000");

      const htmlDetalle = renderToStaticMarkup(
        <StudentDetail
          alumno={alumnoSinPlan}
          activeTab="rutina_actual"
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
        />,
      );

      expect(htmlDetalle).toContain("Sin plan asignado");
      expect(htmlDetalle).not.toContain("Pase libre · Funcional + Boxeo");
      expect(htmlDetalle).not.toContain("$40.000");
    });
  });

  describe("2. Cobros reales Supabase: cargarCobros, syncWithLiveAlumnos, registrarPago y asignar adicional", () => {
    it("cargarCobros lee tablas reales de Supabase cuando hay sesión y syncWithLiveAlumnos no borra cobros reales", async () => {
      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: COACH_ID } as any },
        error: null,
      });

      const fromMock = vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        const rowsByTable: Record<string, unknown[]> = {
          cobros: [
            {
              id: "55555555-5555-4555-8555-555555555551",
              contratacion_id: "66666666-6666-4666-8666-666666666661",
              alumno_id: ALU_1,
              periodo: "2026-11-01",
              monto: 25000,
              fecha_vencimiento: "2026-11-25",
              estado: "PAGADO",
              concepto: "Funcional 2x",
              notas: null,
              created_at: "2026-11-01T10:00:00Z",
              updated_at: "2026-11-01T10:00:00Z",
            },
          ],
          contrataciones: [
            {
              id: "66666666-6666-4666-8666-666666666661",
              alumno_id: ALU_1,
              plan_membresia_id: PLAN_FUNC_ID,
              actividad: "FUNCIONAL",
              tipo_servicio: "PRESENCIAL",
              precio_pactado: 25000,
              estado: "VIGENTE",
              dia_vencimiento: 25,
              dias_aviso_previo: 5,
              fecha_inicio: "2026-11-01",
              fecha_fin: "2026-12-01",
              created_at: "2026-11-01T10:00:00Z",
              updated_at: "2026-11-01T10:00:00Z",
            },
          ],
          planes_membresia: [
            {
              id: PLAN_FUNC_ID,
              nombre: "Funcional 2x",
              limite_semanal: 2,
              cantidad_actividades: 1,
              duracion_meses: 1,
              precio: 25000,
              activo: true,
              created_at: "2026-11-01T10:00:00Z",
              updated_at: "2026-11-01T10:00:00Z",
            },
          ],
          pagos: [],
          alumno_actividades: [],
          perfiles: [
            { id: ALU_1, nombre_completo: "Ana Real", email: "ana@real.local", telefono: null },
          ],
        };

        const data = rowsByTable[table] ?? [];
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data, error: null }),
            then: (resolve: (val: any) => void) => resolve({ data, error: null }),
          }),
        } as any;
      });

      await useCobrosStore.getState().cargarCobros();

      expect(fromMock).toHaveBeenCalledWith("cobros");
      expect(fromMock).toHaveBeenCalledWith("planes_membresia");

      const cobrosCargados = useCobrosStore.getState().cobros;
      expect(cobrosCargados).toHaveLength(1);
      expect(cobrosCargados[0]!.alumnoNombre).toBe("Ana Real");
      expect(cobrosCargados[0]!.servicioNombre).toBe("Funcional 2x");
      expect(cobrosCargados[0]!.monto).toBe(25000);

      // syncWithLiveAlumnos con lista vacía o parcial no debe borrar cobros reales
      useCobrosStore.getState().syncWithLiveAlumnos([{ id: ALU_2 }]);
      expect(useCobrosStore.getState().cobros).toHaveLength(1);
    });

    it("GIVEN un alumno con Funcional pago WHEN se agrega Boxeo adicional con monto editado ($10.000) como Pendiente THEN invoca asignar_suscripcion_y_cobro y aparece en /studio/cobros", async () => {
      const alumno = makeAlumno(ALU_1, "Ana Real", "ana@real.local");
      useCoachStudioStore.setState({
        alumnos: [alumno],
        contrataciones: [
          {
            id: "66666666-6666-4666-8666-666666666661",
            alumno_id: ALU_1,
            plan_membresia_id: PLAN_FUNC_ID,
            actividad: "FUNCIONAL",
            tipo_servicio: "PRESENCIAL",
            precio_pactado: 25000,
            estado: "VIGENTE",
            dia_vencimiento: 10,
            dias_aviso_previo: 5,
            fecha_inicio: "2026-11-01",
            fecha_fin: "2026-12-01",
            created_at: "2026-11-01T10:00:00Z",
            updated_at: "2026-11-01T10:00:00Z",
          },
        ],
        isLiveDatabase: true,
      });

      useCobrosStore.setState({
        isLiveMode: true,
        planes: [
          {
            id: PLAN_BOX_ID,
            nombre: "Boxeo 2x",
            limite_semanal: 2,
            cantidad_actividades: 1,
            duracion_meses: 1,
            precio: 22000,
            activo: true,
            actividad_tipo: "BOXEO",
            created_at: "2026-11-01T10:00:00Z",
            updated_at: "2026-11-01T10:00:00Z",
          },
        ],
        cobros: [
          {
            id: "55555555-5555-4555-8555-555555555551",
            alumnoId: ALU_1,
            alumnoNombre: "Ana Real",
            alumnoEmail: "ana@real.local",
            alumnoTelefono: null,
            contratacionId: "66666666-6666-4666-8666-666666666661",
            planId: PLAN_FUNC_ID,
            servicioNombre: "Funcional 2x",
            actividad: "FUNCIONAL",
            monto: 25000,
            montoLista: 25000,
            diaVencimiento: 10,
            fechaVencimiento: "2026-12-01",
            estado: "PAGADO",
          },
        ],
      });

      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: COACH_ID } as any },
        error: null,
      });

      const rpcSpy = vi.spyOn(supabase, "rpc").mockImplementation((async (fn: string) => {
        if (fn === "asignar_suscripcion_y_cobro") {
          return {
            data: [
              {
                contratacion_id: "66666666-6666-4666-8666-666666666662",
                cobro_id: "55555555-5555-4555-8555-555555555552",
                pago_id: null,
                estado_cobro: "PENDIENTE",
                monto: 10000,
                concepto: "Boxeo (adicional)",
              },
            ],
            error: null,
          };
        }
        return {
          data: {
            id: "55555555-5555-4555-8555-555555555552",
            estado: "PAGADO",
            monto: 10000,
            fecha_vencimiento: "2026-12-01",
            notas: "Pago adicional",
          },
          error: null,
        };
      }) as any);

      await useCoachStudioStore.getState().vincularPlanMembresiaAlumno({
        alumnoId: ALU_1,
        planId: PLAN_BOX_ID,
        actividad: "BOXEO",
        monto: 10000,
        pagado: false,
        esAdicional: true,
        concepto: "Boxeo (adicional)",
        notas: "Diferencia mitad de mes",
      });

      expect(rpcSpy).toHaveBeenCalledWith(
        "asignar_suscripcion_y_cobro",
        expect.objectContaining({
          p_alumno_id: ALU_1,
          p_plan_id: PLAN_BOX_ID,
          p_actividad: "BOXEO",
          p_monto: 10000,
          p_pagado: false,
          p_es_adicional: true,
          p_concepto: "Boxeo (adicional)",
          p_nota: "Diferencia mitad de mes",
        }),
      );

      // Ambas filas aparecen en /studio/cobros (sin colapsar el adicional!)
      const cobrosActuales = useCobrosStore.getState().cobros;
      expect(ultimaSuscripcionPorContrato(cobrosActuales)).toHaveLength(2);

      const htmlCobros = renderToStaticMarkup(<CobrosPanel />);
      expect(htmlCobros).toContain("Boxeo (adicional)");
      expect(htmlCobros).toContain("$10.000");
      expect(htmlCobros).toContain("Pendiente");

      // Confirmar el pago via registrarPago RPC
      await useCobrosStore.getState().registrarPago({
        contratacionId: "66666666-6666-4666-8666-666666666662",
        monto: 10000,
        medioPago: "EFECTIVO",
        notas: "Pago adicional",
      });

      expect(rpcSpy).toHaveBeenCalledWith("registrar_pago", {
        p_cobro_id: "55555555-5555-4555-8555-555555555552",
        p_monto: 10000,
        p_metodo: "EFECTIVO",
        p_nota: "Pago adicional",
      });
    });

    it("ModalAsignarPlan e InviteStudentModal prellenan precio editable y toggle Pendiente de cobro / Pagó sin PENDIENTE_PAGO", () => {
      const htmlModal = renderToStaticMarkup(
        <ModalAsignarPlan
          abierto={true}
          onCerrar={vi.fn()}
          alumnoId={ALU_1}
          alumnoNombre="Ana Real"
          planesDisponibles={[
            {
              id: PLAN_BOX_ID,
              nombre: "Boxeo 2x",
              limite_semanal: 2,
              cantidad_actividades: 1,
              duracion_meses: 1,
              precio: 22000,
              activo: true,
              actividad_tipo: "BOXEO",
              created_at: "2026-11-01T10:00:00Z",
              updated_at: "2026-11-01T10:00:00Z",
            },
          ]}
          tienePlanesActivos={true}
          onConfirmar={vi.fn()}
        />,
      );

      expect(htmlModal).toContain('data-testid="input-asignar-monto"');
      expect(htmlModal).toContain('value="22000"');
      expect(htmlModal).toContain('data-testid="toggle-asignar-pendiente"');
      expect(htmlModal).toContain('data-testid="toggle-asignar-pago"');
      expect(htmlModal).toContain("Pendiente de cobro");
      expect(htmlModal).toContain(">Pagó<");

      const htmlInvite = renderToStaticMarkup(
        <InviteStudentModal isOpen={true} onClose={vi.fn()} onInvited={vi.fn()} />,
      );
      expect(htmlInvite).toContain("Pendiente de cobro");
      expect(htmlInvite).toContain("Pagó");

      const inviteCode = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/invite-student-modal.tsx"),
        "utf-8",
      );
      expect(inviteCode).not.toContain("PENDIENTE_PAGO");
      expect(inviteCode).toContain("asignarSuscripcionYCobro");
    });
  });

  describe("3. Labels monocromáticos sin color (B, F, P) en Dashboard y Ficha", () => {
    it("derivarLabelsActividadAlumno devuelve B, F, P según actividades, contrataciones y planes reales", () => {
      const acts: AlumnoActividad[] = [
        {
          id: "aa-1",
          alumno_id: ALU_1,
          actividad: "BOXEO",
          veces_por_semana: 2,
          pase_libre: false,
          created_at: "2026-11-01T10:00:00Z",
          updated_at: "2026-11-01T10:00:00Z",
        },
      ];
      const planes: PlanEntrenamiento[] = [
        {
          id: "plan-r1",
          alumno_id: ALU_1,
          nombre: "Fuerza Base",
          estado: "ACTIVO",
          profesor_id: COACH_ID,
          fecha_inicio: "2026-11-01",
          fecha_fin: "2026-12-01",
          comentarios: null,
          created_at: "2026-11-01T10:00:00Z",
          updated_at: "2026-11-01T10:00:00Z",
        },
      ];

      const labelsBP = derivarLabelsActividadAlumno({
        alumnoId: ALU_1,
        alumnoActividades: acts,
        contrataciones: [],
        planes,
      });
      expect(labelsBP.map((l) => l.codigo)).toEqual(["B", "P"]);

      const labelsVacio = derivarLabelsActividadAlumno({
        alumnoId: ALU_2,
        alumnoActividades: acts,
        contrataciones: [],
        planes,
      });
      expect(labelsVacio).toEqual([]);

      const contratacionesPaseLibre: Contratacion[] = [
        {
          id: "c-libre",
          alumno_id: ALU_2,
          plan_membresia_id: PLAN_FUNC_ID,
          actividad: null,
          tipo_servicio: "PRESENCIAL",
          precio_pactado: 40000,
          estado: "VIGENTE",
          dia_vencimiento: 10,
          dias_aviso_previo: 5,
          fecha_inicio: "2026-11-01",
          fecha_fin: "2026-12-01",
          created_at: "2026-11-01T10:00:00Z",
          updated_at: "2026-11-01T10:00:00Z",
        },
      ];
      const labelsBFP = derivarLabelsActividadAlumno({
        alumnoId: ALU_2,
        alumnoActividades: [],
        contrataciones: contratacionesPaseLibre,
        planes: [{ ...planes[0]!, alumno_id: ALU_2 }],
      });
      expect(labelsBFP.map((l) => l.codigo)).toEqual(["B", "F", "P"]);
    });

    it("ActivityLabels renderiza badges neutros sin color y aparece en Dashboard y Ficha del Alumno", () => {
      const alumno = makeAlumno(ALU_1, "Lucas Boxeo", "lucas@test.local");
      const acts: AlumnoActividad[] = [
        {
          id: "aa-box",
          alumno_id: ALU_1,
          actividad: "BOXEO",
          veces_por_semana: 2,
          pase_libre: false,
          created_at: "2026-11-01T10:00:00Z",
          updated_at: "2026-11-01T10:00:00Z",
        },
      ];
      const rutina: PlanEntrenamiento = {
        id: "plan-r1",
        alumno_id: ALU_1,
        nombre: "Boxeo Fuerza",
        estado: "ACTIVO",
        profesor_id: COACH_ID,
        fecha_inicio: "2026-11-01",
        fecha_fin: "2026-12-01",
        comentarios: null,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      };

      const htmlLabels = renderToStaticMarkup(
        <ActivityLabels
          labels={[
            { codigo: "B", titulo: "Boxeo" },
            { codigo: "P", titulo: "Plan / Rutina asignada" },
          ]}
        />,
      );
      expect(htmlLabels).toContain("border-border bg-transparent");
      expect(htmlLabels).toContain("text-foreground");
      expect(htmlLabels).not.toMatch(/bg-(emerald|amber|rose|cyan|blue|green|red)-/);
      expect(htmlLabels).toContain('data-testid="activity-label-B"');
      expect(htmlLabels).toContain('data-testid="activity-label-P"');

      // Dashboard
      const htmlDashboard = renderToStaticMarkup(
        <CoachStudioView
          initialAlumnosExpanded={true}
          initialDataset={{
            alumnos: [alumno],
            planes: [rutina],
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
      expect(htmlDashboard).toContain('data-testid="activity-label-B"');
      expect(htmlDashboard).toContain('data-testid="activity-label-P"');
      expect(htmlDashboard).not.toContain('data-testid="activity-label-F"');

      // Ficha del Alumno
      useCoachStudioStore.setState({ alumnoActividades: acts, contrataciones: [] });
      const htmlFicha = renderToStaticMarkup(
        <StudentDetail
          alumno={alumno}
          activeTab="rutina_actual"
          onTabChange={vi.fn()}
          onBack={vi.fn()}
          rutinaActiva={rutina}
          historialPlanes={[rutina]}
          dias={[]}
          ejerciciosEnRutina={[]}
          ejerciciosCatalogo={[]}
          onOpenHistoricalLoads={vi.fn()}
          onClonarUltimaRutina={vi.fn().mockResolvedValue(null)}
          onExtenderVigencia={vi.fn().mockResolvedValue(null)}
          isOffline={false}
        />,
      );
      expect(htmlFicha).toContain('data-testid="activity-label-B"');
      expect(htmlFicha).toContain('data-testid="activity-label-P"');
      expect(htmlFicha).not.toContain('data-testid="activity-label-F"');
    });
  });
});
