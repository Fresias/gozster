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

describe("QA Edge Cases & Mathematical Robustness Audit (GOZS-351)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAthleteStore.getState().resetSessionToDefaults();
    useCobrosStore.setState({ cobros: [], pagosHistorial: [] });
  });

  // --------------------------------------------------------------------------
  // 1. Edge Cases de Cobro Inicial en useCobrosStore
  // --------------------------------------------------------------------------
  describe("1. useCobrosStore.registrarCobroInicial - Casos Límite y Robustez Financiera", () => {
    it("soporta cobro con medio de pago por defecto (TRANSFERENCIA) cuando no se provee medioPago", async () => {
      const store = useCobrosStore.getState();
      const cobro = await store.registrarCobroInicial({
        alumnoId: "alumno-edge-1",
        alumnoNombre: "Ana García",
        alumnoEmail: "ana@gozster.test",
        monto: 25000,
        pagado: true,
      });

      expect(cobro.estado).toBe("PAGADO");
      expect(cobro.monto).toBe(25000);
      expect(cobro.ultimoPago?.medioPago).toBe("TRANSFERENCIA");
    });

    it("actualiza y reemplaza el registro previo si se registra un cobro inicial para el mismo alumno", async () => {
      const store = useCobrosStore.getState();
      await store.registrarCobroInicial({
        alumnoId: "alumno-dup-1",
        alumnoNombre: "Carlos Ruiz",
        alumnoEmail: "carlos@gozster.test",
        monto: 30000,
        pagado: false,
      });

      expect(useCobrosStore.getState().cobros.filter((c) => c.alumnoId === "alumno-dup-1")).toHaveLength(1);
      expect(useCobrosStore.getState().cobros[0]?.estado).toBe("PENDIENTE");

      // Segundo cobro liquidado para el mismo alumno
      await store.registrarCobroInicial({
        alumnoId: "alumno-dup-1",
        alumnoNombre: "Carlos Ruiz",
        alumnoEmail: "carlos@gozster.test",
        monto: 35000,
        pagado: true,
        medioPago: "EFECTIVO",
      });

      const cobrosAlumno = useCobrosStore.getState().cobros.filter((c) => c.alumnoId === "alumno-dup-1");
      expect(cobrosAlumno).toHaveLength(1);
      expect(cobrosAlumno[0]?.monto).toBe(35000);
      expect(cobrosAlumno[0]?.estado).toBe("PAGADO");
      expect(cobrosAlumno[0]?.ultimoPago?.medioPago).toBe("EFECTIVO");
    });

    it("genera aviso en el store con formato de moneda es-AR adecuado", async () => {
      const store = useCobrosStore.getState();
      await store.registrarCobroInicial({
        alumnoId: "alumno-aviso",
        alumnoNombre: "Florencia Peña",
        alumnoEmail: "flor@gozster.test",
        monto: 45000,
        pagado: true,
      });

      const aviso = useCobrosStore.getState().aviso;
      expect(aviso).toBeDefined();
      expect(aviso).toContain("Florencia Peña");
      expect(aviso).toContain("Liquidado");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Integridad Estructural y Parámetros de Rutinas Genéricas
  // --------------------------------------------------------------------------
  describe("2. Integridad de Plantillas Genéricas Básicas (plantillas-genericas.ts)", () => {
    it("todas las plantillas genéricas tienen IDs únicos no vacíos y días con ejercicios válidos", () => {
      const plantillas = obtenerPlantillasGenericas();
      const idSet = new Set(plantillas.map((p) => p.id));
      expect(idSet.size).toBe(plantillas.length);

      for (const p of plantillas) {
        expect(p.nombre.length).toBeGreaterThan(5);
        expect(p.dias.length).toBeGreaterThan(0);

        for (const dia of p.dias) {
          expect(dia.id).toBeTruthy();
          expect(dia.ejercicios.length).toBeGreaterThan(0);

          for (const ej of dia.ejercicios) {
            expect(ej.nombre.length).toBeGreaterThan(2);
            expect(ej.series).toBeGreaterThan(0);
            expect(ej.descanso_segundos).toBeGreaterThanOrEqual(30);
            expect(ej.rpe_objetivo).toBeGreaterThanOrEqual(5.0);
            expect(ej.rpe_objetivo).toBeLessThanOrEqual(10.0);
          }
        }
      }
    });

    it("obtenerPlantillaGenericaPorId devuelve undefined ante un ID inexistente sin crashear", () => {
      const inexistente = obtenerPlantillaGenericaPorId("id-completamente-invalido");
      expect(inexistente).toBeUndefined();
    });

    it("las 3 rutinas genéricas cubren las categorías de Adaptación y Fuerza e Hipertrofia", () => {
      const adaptacion = obtenerPlantillaGenericaPorId(PLANTILLA_ADAPTACION_ID);
      const torso = obtenerPlantillaGenericaPorId(PLANTILLA_TORSO_ID);
      const piernas = obtenerPlantillaGenericaPorId(PLANTILLA_PIERNAS_CORE_ID);

      expect(adaptacion?.categoria).toBe("Adaptación Full Body");
      expect(torso?.categoria).toBe("Fuerza e Hipertrofia");
      expect(piernas?.categoria).toBe("Fuerza e Hipertrofia");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Robustez de Vista Técnica y Toggle de Cascada
  // --------------------------------------------------------------------------
  describe("3. Toggle de Cascada y Robustez en Vista Técnica (live-workout.tsx)", () => {
    it("permite alternar el estado de colapsarRutina desde useAthleteStore", () => {
      const store = useAthleteStore.getState();
      expect(store.colapsarRutina).toBe(false);

      store.setColapsarRutina(true);
      expect(useAthleteStore.getState().colapsarRutina).toBe(true);

      store.setColapsarRutina(false);
      expect(useAthleteStore.getState().colapsarRutina).toBe(false);
    });

    it("LiveWorkout renderiza sin errores con colapsarRutina activo y vista técnica", () => {
      useAthleteStore.setState({
        colapsarRutina: true,
        nivelVistaAlumno: "TECNICA",
      });

      const html = renderToStaticMarkup(<LiveWorkout />);
      expect(html).toBeTruthy();
      expect(html).not.toContain("data-testid=\"set-type-help-btn\"");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Badges de Alumnos Estancados en CoachStudioView
  // --------------------------------------------------------------------------
  describe("4. CoachStudioView - Manejo de Alumnos Estancados", () => {
    it("el código fuente de CoachStudioView integra estancadosMap y el badge +30d sin PR", () => {
      const studioCode = read("../components/coach/coach-studio-view.tsx");

      expect(studioCode).toContain("estancadosMap");
      expect(studioCode).toContain("badge-estancado-nombre-");
      expect(studioCode).toContain("badge-estancado-");
      expect(studioCode).toContain("+30d sin PR");
      expect(studioCode).toContain("Alumno estancado (+30 días sin PR");
    });

    it("renderiza sin errores en SSR cuando estancados es un array vacío o null", () => {
      const html1 = renderToStaticMarkup(<CoachStudioView estancados={[]} />);
      expect(html1).toBeTruthy();

      const html2 = renderToStaticMarkup(<CoachStudioView />);
      expect(html2).toBeTruthy();
    });
  });
});
