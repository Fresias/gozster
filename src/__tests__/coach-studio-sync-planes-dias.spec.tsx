import * as React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/studio",
  useSearchParams: () => new URLSearchParams(),
}));

import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { DEMO_GIMNASIO } from "@/services/coach-demo-dataset";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type {
  Perfil,
  PlanEntrenamiento,
  DiaRutina,
  EjercicioEnRutina,
  Ejercicio,
} from "@/types/database.types";

describe("GOZS-373: Coach Studio — Sincronización de Planes y Días en Ficha de Alumno con Dataset Canónico", () => {
  beforeEach(() => {
    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      chatAlumnoId: null,
      activeTab: "rutina_actual",
      isLiveDatabase: false,
    });
  });

  describe("Criterio 1 (Gherkin): initialDataset con alumno, plan activo y 4 días configurados", () => {
    const alumnoMock: Perfil = {
      id: "alumno-test-01",
      nombre_completo: "Marcos Galván",
      email: "marcos.galvan@test.ar",
      telefono: "+54 9 11 5555-1111",
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      profesor_asignado_id: "profe-001",
      fecha_baja: null,
      fecha_vencimiento_cuota: "2026-11-25",
      ultimo_entreno_at: "2026-11-04T12:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-11-04T12:00:00Z",
    };

    const planActivoMock: PlanEntrenamiento = {
      id: "plan-marcos-4d",
      alumno_id: "alumno-test-01",
      profesor_id: "profe-001",
      nombre: "Hipertrofia Avanzada 4 Días",
      estado: "ACTIVO",
      fecha_inicio: "2026-10-01",
      fecha_fin: "2026-12-01",
      comentarios: "Foco en progresión de cargas.",
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    };

    const diasMock: DiaRutina[] = [
      {
        id: "dia-marcos-1",
        plan_id: "plan-marcos-4d",
        nombre: "Día 1: Torso Pesado",
        orden: 1,
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        id: "dia-marcos-2",
        plan_id: "plan-marcos-4d",
        nombre: "Día 2: Pierna Fuerza",
        orden: 2,
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        id: "dia-marcos-3",
        plan_id: "plan-marcos-4d",
        nombre: "Día 3: Torso Hipertrofia",
        orden: 3,
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        id: "dia-marcos-4",
        plan_id: "plan-marcos-4d",
        nombre: "Día 4: Pierna Volumen & Isquios",
        orden: 4,
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-01T10:00:00Z",
      },
    ];

    const ejerciciosMock: Ejercicio[] = [
      {
        id: "ej-press-banca",
        nombre: "Press de Banca Plano",
        comentario: "Con barra",
        url_video: null,
        musculos_principales: ["Pectoral"],
        musculos_secundarios: ["Tríceps"],
        creado_por: "profe-001",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "ej-sentadilla",
        nombre: "Sentadilla Trasera",
        comentario: "Profunda",
        url_video: null,
        musculos_principales: ["Cuádriceps"],
        musculos_secundarios: ["Glúteos"],
        creado_por: "profe-001",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    const ejerciciosEnRutinaMock: EjercicioEnRutina[] = [
      {
        id: "er-m-1",
        dia_id: "dia-marcos-1",
        ejercicio_id: "ej-press-banca",
        orden: 1,
        series: 4,
        repeticiones: "8-8-8-8",
        descanso_segundos: 120,
        rpe_objetivo: 8.5,
        notas: "Pausa en pecho",
        es_superserie: false,
        grupo_superserie: null,
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        id: "er-m-2",
        dia_id: "dia-marcos-2",
        ejercicio_id: "ej-sentadilla",
        orden: 1,
        series: 4,
        repeticiones: "6-6-6-6",
        descanso_segundos: 180,
        rpe_objetivo: 8.0,
        notas: "Cadencia controlada",
        es_superserie: false,
        grupo_superserie: null,
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-01T10:00:00Z",
      },
    ];

    const initialDataset: LiveSupabaseDataset = {
      alumnos: [alumnoMock],
      planes: [planActivoMock],
      dias: diasMock,
      ejerciciosEnRutina: ejerciciosEnRutinaMock,
      ejercicios: ejerciciosMock,
    };

    it("GIVEN initialDataset con alumno, plan activo y 4 días WHEN el coach abre la ficha THEN la isla muestra los 4 días con sus ejercicios y no 'Sin días configurados'", () => {
      const html = renderToStaticMarkup(
        <CoachStudioView
          initialDataset={initialDataset}
          initialSelectedAlumnoId="alumno-test-01"
        />
      );

      // 1. Debe estar en la Ficha del Alumno (StudentDetail)
      expect(html).toContain("Marcos Galván");
      expect(html).toContain("Hipertrofia Avanzada 4 Días");

      // 2. La isla de rutina workbench debe mostrar 4 días configurados
      expect(html).toContain("4 días configurados");
      expect(html).toContain("Día 1: Torso Pesado");
      expect(html).toContain("Día 2: Pierna Fuerza");
      expect(html).toContain("Día 3: Torso Hipertrofia");
      expect(html).toContain("Día 4: Pierna Volumen &amp; Isquios");

      // 3. Los ejercicios configurados deben aparecer
      expect(html).toContain("Press de Banca Plano");
      expect(html).toContain("Sentadilla Trasera");

      // 4. Prohibido mostrar 'Sin días configurados en este plan' o 'Sin días cargados'
      expect(html).not.toContain("Sin días configurados en este plan");
      expect(html).not.toContain("Sin días cargados en este plan");
    });
  });

  describe("Criterio 2 (Gherkin): initialDataset vacío (modo demo puro)", () => {
    it("GIVEN initialDataset vacío WHEN se abre la ficha de Lucas THEN todos los días y planes coinciden con el mock canónico", () => {
      const html = renderToStaticMarkup(
        <CoachStudioView
          initialDataset={null}
          initialSelectedAlumnoId="demo-alumno-01-lucas"
        />
      );

      // Lucas Giménez en modo demo
      expect(html).toContain("Lucas");
      expect(html).toContain("Hipertrofia &amp; Fuerza Torso-Pierna v2");

      // Días derivados coherentemente del mock canónico (d1-torso, d2-pierna)
      expect(html).toContain("2 días configurados");
      expect(html).toContain("Día 1: Torso Pesado &amp; Potencia");
      expect(html).toContain("Día 2: Pierna Fuerza &amp; Cadena Posterior");
      expect(html).not.toContain("Sin días configurados en este plan");
    });

    it("GIVEN initialDataset vacío WHEN se abre la ficha de Celeste THEN la isla de rutina muestra sus 4 días configurados", () => {
      const html = renderToStaticMarkup(
        <CoachStudioView
          initialDataset={{
            alumnos: [],
            planes: [],
            dias: [],
            ejerciciosEnRutina: [],
            ejercicios: [],
          }}
          initialSelectedAlumnoId="demo-alumno-02-celeste"
        />
      );

      // Celeste Gerardi en modo demo
      expect(html).toContain("Celeste");
      expect(html).toContain("Fuerza Femenina &amp; Glúteos 4D");

      // Debe mostrar 4 días configurados derivados coherentemente del demo generator
      expect(html).toContain("4 días configurados");
      expect(html).not.toContain("Sin días configurados en este plan");
    });

    it("GIVEN DEMO_GIMNASIO WHEN se audita la integridad relacional THEN todos los planes activos tienen días y ejercicios correspondientes", () => {
      expect(DEMO_GIMNASIO.dias).toBeDefined();
      expect(DEMO_GIMNASIO.dias.length).toBeGreaterThan(0);
      expect(DEMO_GIMNASIO.ejerciciosEnRutina).toBeDefined();
      expect(DEMO_GIMNASIO.ejerciciosEnRutina.length).toBeGreaterThan(0);

      // Para cada plan activo en DEMO_GIMNASIO, debe haber al menos 1 día asignado
      const planesActivos = DEMO_GIMNASIO.planes.filter((p) => p.estado === "ACTIVO");
      for (const plan of planesActivos) {
        const diasDelPlan = DEMO_GIMNASIO.dias.filter((d) => d.plan_id === plan.id);
        expect(
          diasDelPlan.length,
          `El plan '${plan.nombre}' (${plan.id}) debe tener días configurados`
        ).toBeGreaterThanOrEqual(2);

        // Cada día debe tener ejercicios en rutina
        for (const dia of diasDelPlan) {
          const ejerciciosDelDia = DEMO_GIMNASIO.ejerciciosEnRutina.filter(
            (er) => er.dia_id === dia.id
          );
          expect(
            ejerciciosDelDia.length,
            `El día '${dia.nombre}' (${dia.id}) debe tener ejercicios asociados`
          ).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });
});
