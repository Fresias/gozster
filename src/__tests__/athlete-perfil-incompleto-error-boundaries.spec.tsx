import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { primerNombre, saludoAlumno } from "@/lib/athlete-dias";
import { InicioMisDias } from "@/components/athlete/inicio-mis-dias";
import { CierreDiaModal } from "@/components/athlete/cierre-dia-modal";
import AthleteError from "@/app/(athlete)/athlete/error";
import StudioError from "@/app/(coach)/studio/error";
import { useAthleteStore } from "@/store/use-athlete-store";
import { sembrarPlanAlumno } from "./helpers/plan-alumno-seed";

// renderToStaticMarkup lee el snapshot de servidor (estado inicial): el hook lee el estado vivo sembrado en cada test.
vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

describe("GOZS-372: Manejo Robusto de Perfil Incompleto y Error Boundaries en /athlete y /studio", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setMembershipStatus("ACTIVE");
  });

  describe("1. Helper defensivo primerNombre(nombreCompleto) y saludoAlumno", () => {
    it("retorna 'Hola' cuando nombreCompleto es null, undefined o vacío", () => {
      expect(primerNombre(null)).toBe("Hola");
      expect(primerNombre(undefined)).toBe("Hola");
      expect(primerNombre("")).toBe("Hola");
      expect(primerNombre("   ")).toBe("Hola");
      expect(primerNombre(null as any)).toBe("Hola");
    });

    it("extrae el primer nombre correctamente cuando se pasa un nombre válido", () => {
      expect(primerNombre("Lucas")).toBe("Lucas");
      expect(primerNombre("Lucas Giménez")).toBe("Lucas");
      expect(primerNombre("  Sofía   Rossi  ")).toBe("Sofía");
      expect(primerNombre("Juan Carlos Batman")).toBe("Juan");
    });

    it("respeta un fallback personalizado si se suministra", () => {
      expect(primerNombre(null, "")).toBe("");
      expect(primerNombre("", "Atleta")).toBe("Atleta");
      expect(primerNombre("   ", "Colega")).toBe("Colega");
      expect(primerNombre("Diego Herrera", "Atleta")).toBe("Diego");
    });

    it("saludoAlumno produce 'Hola' para perfiles sin nombre y 'Hola, <Nombre>' cuando está presente", () => {
      expect(saludoAlumno(null)).toBe("Hola");
      expect(saludoAlumno(undefined)).toBe("Hola");
      expect(saludoAlumno("")).toBe("Hola");
      expect(saludoAlumno("   ")).toBe("Hola");
      expect(saludoAlumno("Gabriel")).toBe("Hola, Gabriel");
      expect(saludoAlumno("Gabriel Sanchez")).toBe("Hola, Gabriel");
      expect(saludoAlumno("  Martina  Gómez  ")).toBe("Hola, Martina");
    });
  });

  describe("2. Renderizado defensivo de InicioMisDias con perfil incompleto (/athlete)", () => {
    it("GIVEN perfil con nombre_completo = null WHEN se renderiza THEN muestra 'Hola' sin arrojar TypeError", () => {
      sembrarPlanAlumno();
      const planActual = useAthleteStore.getState().planAlumno!;
      useAthleteStore.setState({
        planAlumno: {
          ...planActual,
          alumnos: [
            {
              ...planActual.alumnos[0]!,
              nombre_completo: null as any,
            },
          ],
        },
      });

      // No debe lanzar TypeError: Cannot read properties of null (reading 'split')
      let html = "";
      expect(() => {
        html = renderToStaticMarkup(<InicioMisDias />);
      }).not.toThrow();

      // Renderiza exactamente "Hola" y no "Hola, " ni "Hola, undefined"
      expect(html).toContain("Hola");
      expect(html).not.toContain("Hola, ");
      expect(html).not.toContain("Hola, undefined");
      expect(html).not.toContain("Hola, null");
    });

    it("GIVEN perfil con nombre_completo = '' (cadena vacía) THEN muestra 'Hola'", () => {
      sembrarPlanAlumno();
      const planActual = useAthleteStore.getState().planAlumno!;
      useAthleteStore.setState({
        planAlumno: {
          ...planActual,
          alumnos: [
            {
              ...planActual.alumnos[0]!,
              nombre_completo: "",
            },
          ],
        },
      });

      const html = renderToStaticMarkup(<InicioMisDias />);
      expect(html).toContain("Hola");
      expect(html).not.toContain("Hola, ");
    });

    it("GIVEN perfil con nombre_completo = 'Gabriel Sanchez' THEN muestra 'Hola, Gabriel'", () => {
      sembrarPlanAlumno();
      const planActual = useAthleteStore.getState().planAlumno!;
      useAthleteStore.setState({
        planAlumno: {
          ...planActual,
          alumnos: [
            {
              ...planActual.alumnos[0]!,
              nombre_completo: "Gabriel Sanchez",
            },
          ],
        },
      });

      const html = renderToStaticMarkup(<InicioMisDias />);
      expect(html).toContain("Hola, Gabriel");
    });

    it("GIVEN alumno sin plan (0 días) y nombre_completo = null THEN vista sin plan renderiza 'Hola'", () => {
      useAthleteStore.setState({
        planAlumno: {
          alumnos: [
            {
              id: "alumno-sin-plan-ni-nombre",
              nombre_completo: null as any,
              peso_corporal_kg: null,
            } as any,
          ],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
        },
      });

      let html = "";
      expect(() => {
        html = renderToStaticMarkup(<InicioMisDias />);
      }).not.toThrow();

      expect(html).toContain('data-testid="inicio-sin-plan"');
      expect(html).toContain("Hola");
      expect(html).not.toContain("Hola, ");
    });
  });

  describe("3. Modal de Cierre de Día defensivo", () => {
    it("no arroja error si studentName es undefined o vacío", () => {
      let html = "";
      expect(() => {
        html = renderToStaticMarkup(
          <CierreDiaModal
            isOpen={true}
            onClose={() => {}}
            tonelajeKg={1200}
            seriesCompletadas={12}
            totalSeries={12}
            studentName={undefined}
            diaNombre="Día 1"
          />
        );
      }).not.toThrow();

      expect(html).toContain("¡Gran entrenamiento!");
    });

    it("muestra el nombre del atleta si studentName es provisto", () => {
      const html = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={1200}
          seriesCompletadas={12}
          totalSeries={12}
          studentName="Carlos Tevez"
          diaNombre="Día 1"
        />
      );

      expect(html).toContain("¡Gran entrenamiento, Carlos!");
    });
  });

  describe("4. Error Boundary de Athlete App (src/app/(athlete)/athlete/error.tsx)", () => {
    it("renderiza 'No pudimos cargar la vista' y botón 'Reintentar'", () => {
      const resetMock = vi.fn();
      const testError = new Error("Fallo de red o render en Athlete App");

      const html = renderToStaticMarkup(
        <AthleteError error={testError} reset={resetMock} />
      );

      expect(html).toContain("No pudimos cargar la vista");
      expect(html).toContain("Reintentar");
      expect(html).toContain('data-testid="athlete-error-boundary"');
      expect(html).toContain('data-testid="athlete-error-retry-btn"');
    });
  });

  describe("5. Error Boundary de Coach Studio (src/app/(coach)/studio/error.tsx)", () => {
    it("renderiza 'No pudimos cargar la vista' y botón 'Reintentar'", () => {
      const resetMock = vi.fn();
      const testError = new Error("Fallo en RPC de Coach Studio");

      const html = renderToStaticMarkup(
        <StudioError error={testError} reset={resetMock} />
      );

      expect(html).toContain("No pudimos cargar la vista");
      expect(html).toContain("Reintentar");
      expect(html).toContain('data-testid="studio-error-boundary"');
      expect(html).toContain('data-testid="studio-error-retry-btn"');
    });
  });
});
