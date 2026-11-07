import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { LiveWorkout } from "@/components/athlete/live-workout";
import { InviteStudentModal } from "@/components/coach/invite-student-modal";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import {
  PLANTILLAS_GENERICAS,
  obtenerPlantillasGenericas,
  obtenerPlantillaGenericaPorId,
  PLANTILLA_ADAPTACION_ID,
  PLANTILLA_TORSO_ID,
  PLANTILLA_PIERNAS_CORE_ID,
} from "@/services/plantillas-genericas";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useCobrosStore } from "@/store/use-cobros-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/studio",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) =>
      typeof sel === "function" ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState(),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-351: Pulido App, Limpieza Taxonomía W/N/F/D, Toggle Cascada, Alta con Cobro y 3 Rutinas Genéricas", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAthleteStore.getState().resetSessionToDefaults();
    useCobrosStore.setState({ cobros: [], pagosHistorial: [] });
  });

  // --------------------------------------------------------------------------
  // CRITERIO 1: Limpieza Taxonomía W/N/F/D en Vista Técnica
  // --------------------------------------------------------------------------
  describe("1. Vista Técnica de la Athlete App (live-workout.tsx)", () => {
    const liveWorkoutCode = read("../components/athlete/live-workout.tsx");

    it("GIVEN live-workout.tsx WHEN se visualiza la pantalla de entrenamiento THEN no renderiza en runtime el popover ni selector manual W/N/F/D", () => {
      // Activar vista técnica en el store
      useAthleteStore.getState().setNivelVistaAlumno("TECNICA");

      const html = renderToStaticMarkup(<LiveWorkout />);

      // NO debe aparecer el botón de ayuda de taxonomía en runtime
      expect(html).not.toContain('data-testid="set-type-help-btn"');
      expect(html).not.toContain("Taxonomía de Series");
      expect(html).not.toContain("Explicación de tipos de serie (W, N, F, D)");
    });

    it("GIVEN ejercicios DROPSET o WARMUP prescritos por el coach THEN se muestran con su distintivo tonal", () => {
      // Configurar sesión con un ejercicio DROPSET y otro WARMUP
      const session = { ...useAthleteStore.getState().currentSession };
      const primerEjercicio = session.ejercicios[0];
      if (primerEjercicio) {
        session.ejercicios = [
          {
            ...primerEjercicio,
            id: "ej-dropset-test",
            nombre: "Elevaciones Laterales",
            musculos_principales: primerEjercicio.musculos_principales || ["Hombros"],
            tipo_serie: "DROPSET",
          },
          ...session.ejercicios.slice(1),
        ];
      }

      useAthleteStore.setState({
        currentSession: session,
        nivelVistaAlumno: "TECNICA",
      });

      const html = renderToStaticMarkup(<LiveWorkout />);

      // Distinctivo tonal para Drop Set
      expect(html).toContain("data-testid=\"fixed-dropset-badge\"");
      expect(html).toContain("Drop Set");
      expect(html).toContain("bg-purple-600");
    });
  });

  // --------------------------------------------------------------------------
  // CRITERIO 2: Toggle Cascada en Modal de Configuración (⚙️)
  // --------------------------------------------------------------------------
  describe("2. Modal de Configuración de la sesión (live-workout.tsx)", () => {
    const liveWorkoutCode = read("../components/athlete/live-workout.tsx");

    it("GIVEN live-workout.tsx THEN contiene el toggle accesible de 'Colapsar rutina en cascada'", () => {
      expect(liveWorkoutCode).toContain('data-testid="toggle-colapsar-rutina"');
      expect(liveWorkoutCode).toContain('Colapsar rutina en cascada');
      expect(liveWorkoutCode).toContain('role="switch"');
      expect(liveWorkoutCode).toContain('setColapsarRutina');
    });

    it("GIVEN useAthleteStore WHEN colapsarRutina cambia THEN minimiza los ejercicios mostrando solo el activo", () => {
      // Por defecto colapsarRutina es false
      expect(useAthleteStore.getState().colapsarRutina).toBe(false);

      // Activar colapsar rutina en cascada
      useAthleteStore.getState().setColapsarRutina(true);
      expect(useAthleteStore.getState().colapsarRutina).toBe(true);

      const html = renderToStaticMarkup(<LiveWorkout />);

      // El contenedor indica rutina colapsada
      expect(html).toContain('data-rutina-colapsada="true"');
      expect(html).toContain('data-testid="badge-rutina-colapsada"');
      expect(html).toContain('colapsada');
    });
  });

  // --------------------------------------------------------------------------
  // CRITERIO 3: Alta de Alumno con Cobro Inicial (invite-student-modal.tsx)
  // --------------------------------------------------------------------------
  describe("3. Modal de Alta de Alumno con Cobro Inicial (invite-student-modal.tsx)", () => {
    const modalCode = read("../components/coach/invite-student-modal.tsx");

    it("GIVEN invite-student-modal.tsx THEN contiene la sección de cobro inicial con todos sus campos", () => {
      expect(modalCode).toContain('data-testid="seccion-cobro-inicial"');
      expect(modalCode).toContain('data-testid="alta-monto-suscripcion"');
      expect(modalCode).toContain('data-testid="alta-pago-realizado"');
      expect(modalCode).toContain('data-testid="alta-pago-pendiente"');
      expect(modalCode).toContain('data-testid="alta-medio-pago"');
      expect(modalCode).toContain('data-testid="alta-nota-pago"');
    });

    it("GIVEN invite-student-modal.tsx abierto THEN renderiza los inputs ergonómicos de cobro inicial", () => {
      const html = renderToStaticMarkup(
        <InviteStudentModal isOpen={true} onClose={vi.fn()} onInvited={vi.fn()} />
      );

      expect(html).toContain('data-testid="alta-monto-suscripcion"');
      expect(html).toContain('data-testid="alta-medio-pago"');
      expect(html).toContain('Pendiente');
      expect(html).toContain('Liquidado');
      expect(html).toContain('Transferencia Bancaria');
      expect(html).toContain('Efectivo');
    });

    it("GIVEN useCobrosStore.registrarCobroInicial WHEN se registra un alumno THEN asienta el cobro liquidado o pendiente", async () => {
      const store = useCobrosStore.getState();

      const itemPendiente = await store.registrarCobroInicial({
        alumnoId: "alumno-nuevo-1",
        alumnoNombre: "Martín Benítez",
        alumnoEmail: "martin@gozster.test",
        monto: 35000,
        pagado: false,
        medioPago: "TRANSFERENCIA",
        notas: "Acuerdo primera cuota",
      });

      expect(itemPendiente.monto).toBe(35000);
      expect(itemPendiente.estado).toBe("PENDIENTE");
      expect(itemPendiente.ultimoPago).toBeUndefined();

      const itemLiquidado = await store.registrarCobroInicial({
        alumnoId: "alumno-nuevo-2",
        alumnoNombre: "Laura Torres",
        alumnoEmail: "laura@gozster.test",
        monto: 40000,
        pagado: true,
        medioPago: "EFECTIVO",
        notas: "Pagó en efectivo en recepción",
      });

      expect(itemLiquidado.monto).toBe(40000);
      expect(itemLiquidado.estado).toBe("PAGADO");
      expect(itemLiquidado.ultimoPago).toBeDefined();
      expect(itemLiquidado.ultimoPago?.medioPago).toBe("EFECTIVO");
    });
  });

  // --------------------------------------------------------------------------
  // CRITERIO 4: 3 Plantillas Genéricas y Badge de Alumno Estancado en /studio
  // --------------------------------------------------------------------------
  describe("4. Población de 3 Rutinas Genéricas y Badge de Estancado", () => {
    it("GIVEN plantillas-genericas.ts THEN contiene exactamente las 3 rutinas genéricas básicas", () => {
      const plantillas = obtenerPlantillasGenericas();
      expect(plantillas).toHaveLength(3);

      const ids = plantillas.map((p) => p.id);
      expect(ids).toContain(PLANTILLA_ADAPTACION_ID);
      expect(ids).toContain(PLANTILLA_TORSO_ID);
      expect(ids).toContain(PLANTILLA_PIERNAS_CORE_ID);

      const nombres = plantillas.map((p) => p.nombre);
      expect(nombres).toContain("Adaptación - Primer día de gimnasio");
      expect(nombres).toContain("Fuerza e Hipertrofia - Torso (Empuje y Tracción)");
      expect(nombres).toContain("Fuerza e Hipertrofia - Piernas y Core");
    });

    it("GIVEN cada plantilla genérica THEN incluye sus días y ejercicios con series, repeticiones y descanso", () => {
      const torso = obtenerPlantillaGenericaPorId(PLANTILLA_TORSO_ID);
      expect(torso).toBeDefined();
      expect(torso?.dias[0]?.ejercicios.length).toBeGreaterThanOrEqual(4);

      const piernas = obtenerPlantillaGenericaPorId(PLANTILLA_PIERNAS_CORE_ID);
      expect(piernas).toBeDefined();
      expect(piernas?.dias[0]?.ejercicios.length).toBeGreaterThanOrEqual(3);
    });

    it("GIVEN CoachStudioView WHEN se renderiza la tabla de alumnos THEN expone el badge de alumno estancado (+30 días sin PR)", () => {
      const studioCode = read("../components/coach/coach-studio-view.tsx");
      // Badge de alumno estancado en la tabla y en la ficha
      expect(studioCode).toContain("30 d sin récord");
      expect(studioCode).toContain("Alumno estancado (+30 días sin PR");
      expect(studioCode).toContain("badge-estancado");
    });
  });
});
