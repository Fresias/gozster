import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CierreDiaModal } from "@/components/athlete/cierre-dia-modal";
import { HistorialSesiones } from "@/components/athlete/historial-sesiones";
import { Tooltip1RM } from "@/components/athlete/tooltip-1rm";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { supabase } from "@/lib/supabase/client";
import { REAL_HISTORIAL_CARGAS } from "@/services/real-mynter-data";
import { sembrarPlanAlumno } from "./helpers/plan-alumno-seed";

// Mock parcial para useAthleteStore en SSR estático
vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign((sel: (s: any) => unknown) => sel(mod.useAthleteStore.getState()), mod.useAthleteStore);
  return { ...mod, useAthleteStore: hook };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/studio",
}));

describe("GOZS-359: Corrección de MiProgreso, Poda de Tonelaje Kg y Fix Scroll Horizontal en Studio", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sembrarPlanAlumno("Fernando Rosales");
    useAthleteStore.setState({
      historialSesiones: REAL_HISTORIAL_CARGAS["66b92b9a-1ce7-4e2e-a47c-7c5600000000"] || [],
    });
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.getState().resetSessionToDefaults();
  });

  describe("1. Poda de Tonelaje Kg en Modal de Celebración de Cierre de Día", () => {
    it("GIVEN CierreDiaModal WHEN se renderiza THEN no figura el texto ni el valor del tonelaje/volumen total acumulado en kg", () => {
      const html = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={1960}
          seriesCompletadas={18}
          totalSeries={18}
          duracionMinutos={42}
          rachaDias={3}
          metaDiasSemana={3}
          diasCompletadosSemana={1}
        />
      );

      // Poda total de Tonelaje en UI del atleta
      expect(html).not.toContain("Tonelaje Total Acumulado");
      expect(html).not.toContain("Volumen total levantado");
      expect(html).not.toContain("1.960 kg");
      expect(html).not.toContain('data-testid="hero-metric-tonelaje"');

      // Mantiene métricas operativas clave
      expect(html).toContain('data-testid="hero-metric-summary-card"');
      expect(html).toContain('data-testid="hero-metric-series"');
      expect(html).toContain("18/18");
      expect(html).toContain('data-testid="hero-metric-tiempo"');
      expect(html).toContain("42 min");
    });

    it("GIVEN CierreDiaModal WHEN se renderiza el ranking de constancia THEN muestra 'Mantener una buena racha tendrá su recompensa'", () => {
      const html = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={1960}
          seriesCompletadas={18}
          totalSeries={18}
          rachaDias={2}
          metaDiasSemana={2}
          diasCompletadosSemana={1}
        />
      );

      expect(html).toContain('data-testid="cierre-dia-ranking-constancia"');
      expect(html).toContain("Impacto en Ranking de Constancia");
      expect(html).toContain("Mantener una buena racha tendrá su recompensa.");
      expect(html).not.toContain("tonelaje acumulado, sin toxicidad competitiva");
    });

    it("GIVEN CierreDiaModal con alumno de frecuencia 3 días WHEN finaliza THEN la racha refleja la frecuencia real y no 5 días rígidos", () => {
      const html = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={1960}
          seriesCompletadas={15}
          totalSeries={15}
          rachaDias={3}
          rachaPrevia={2}
          metaDiasSemana={3}
          diasCompletadosSemana={2}
        />
      );

      expect(html).toContain('data-testid="racha-dias-valor"');
      expect(html).toContain("3 días");
      expect(html).not.toContain("5 días");
      expect(html).toContain("Día 2 de 3 completados esta semana");
    });

    it("GIVEN CierreDiaModal con PRs WHEN tiene cálculo de 1RM THEN incluye el tooltip interactivo '?'", () => {
      const html = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={1960}
          seriesCompletadas={15}
          totalSeries={15}
          recordsObtenidos={[
            {
              exerciseName: "Press de Banca Plano",
              peso_kg: 100,
              reps_hechas: 5,
              epley_kg: 116,
            },
          ]}
        />
      );

      expect(html).toContain("1RM ~116 kg");
      expect(html).toContain('data-testid="tooltip-1rm-trigger"');
      expect(html).toContain('aria-label="¿Qué es 1RM? Ver explicación"');
    });
  });

  describe("2. Poda de Volumen Total en Historial de Sesiones y Mini Dashboard", () => {
    it("GIVEN HistorialSesiones WHEN se renderiza THEN no figura Volumen Total en el encabezado ni en las tarjetas de sesión", () => {
      const html = renderToStaticMarkup(<HistorialSesiones />);

      // En el encabezado superior
      expect(html).toContain("Sesiones Realizadas");
      expect(html).toContain("Series Totales");
      expect(html).not.toContain("Volumen Total");

      // No debe figurar volumen en kg en las líneas de sesión
      expect(html).toContain("ejercicios");
      expect(html).toContain("series");
      expect(html).not.toContain("volumenTotalKg");
    });

    it("GIVEN HistorialSesiones en la pestaña de Mini Dashboard WHEN se visualiza THEN no figura la tarjeta de Volumen Total", () => {
      const html = renderToStaticMarkup(<HistorialSesiones initialTab="dashboard" />);

      // Tarjetas clave del mini dashboard
      expect(html).toContain("Récord de Carga");
      expect(html).toContain("Mejor 1RM (Epley)");
      expect(html).toContain("Máx. Repeticiones");
      expect(html).not.toContain("<span>Volumen Total</span>");
    });

    it("GIVEN la tarjeta de Mejor 1RM (Epley) en Mini Dashboard THEN incluye el tooltip interactivo '?'", () => {
      const html = renderToStaticMarkup(<HistorialSesiones initialTab="dashboard" />);

      expect(html).toContain('data-testid="tooltip-1rm-trigger"');
      expect(html).toContain("Mejor 1RM (Epley)");
    });
  });

  describe("3. Componente Tooltip1RM: Explicación de Repetición Máxima Teórica", () => {
    it("GIVEN Tooltip1RM THEN renderiza el botón accesible con su título explicativo", () => {
      const html = renderToStaticMarkup(<Tooltip1RM />);

      expect(html).toContain('data-testid="tooltip-1rm-trigger"');
      expect(html).toContain('aria-label="¿Qué es 1RM? Ver explicación"');
      expect(html).toContain('title="1RM: repetición máxima teórica calculada por fórmula a partir del peso y reps realizadas"');
    });
  });

  describe("4. Fix de CargarMiProgreso en useAthleteStore", () => {
    it("GIVEN sesión cerrada o con studentId no seteado WHEN se invoca cargarMiProgreso THEN resuelve el alumnoId vía auth o perfil y no falla", async () => {
      const store = useAthleteStore.getState();

      // Simular sesión cerrada / limpia
      useAthleteStore.setState({
        currentSession: {
          id: "sesion-cerrada-123",
          nombre_rutina: "Día 1",
          fecha: new Date().toISOString(),
          ejercicios: [],
          studentId: undefined, // Simula sesión limpiada
        },
      });

      // Mock auth.getUser retornando un usuario válido
      vi.spyOn(supabase.auth, "getUser").mockResolvedValueOnce({
        data: {
          user: {
            id: "66b92b9a-1ce7-4e2e-a47c-7c5600000000",
            email: "atleta@gozster.com",
          } as any,
        },
        error: null,
      });

      // Mock supabase select de registro_series y registro_sesiones
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        in: vi.fn().mockResolvedValue({ data: [] }),
      });
      vi.spyOn(supabase, "from").mockImplementation((() => ({
        select: selectMock,
      })) as any);

      await expect(store.cargarMiProgreso()).resolves.not.toThrow();
      expect(useAthleteStore.getState().cargandoMiProgreso).toBe(false);
    });

    it("GIVEN finalizar o marcar un día completado en el store THEN dispara la recarga automática de miProgreso", async () => {
      const store = useAthleteStore.getState();
      const cargarMiProgresoSpy = vi.spyOn(store, "cargarMiProgreso").mockResolvedValue();

      store.marcarDiaCompletado("dia-1");

      // Esperar microtarea
      await new Promise((r) => setTimeout(r, 10));

      expect(cargarMiProgresoSpy).toHaveBeenCalled();
    });
  });

  describe("5. Fix Scroll Horizontal en Coach Studio (/studio)", () => {
    it("GIVEN CoachStudioView WHEN se renderiza THEN el contenedor principal tiene overflow-x-hidden y la tabla matriz tiene contención overflow-x-auto táctil", () => {
      const html = renderToStaticMarkup(
        <CoachStudioView
          initialDataset={{
            alumnos: [],
            planes: [],
            dias: [],
            ejerciciosEnRutina: [],
            ejercicios: [],
          }}
          estancados={[]}
        />
      );

      // Contenedor principal sin desbordamiento horizontal
      expect(html).toContain("overflow-x-hidden");

      // Directorio de atletas
      expect(html).toContain('data-testid="alumnos-directory"');

      // Contención estricta de la tabla de atletas con ergonomía táctil en el código fuente
      const fs = require("node:fs");
      const path = require("node:path");
      const code = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
        "utf-8"
      );
      expect(code).toContain("overflow-x-auto touch-pan-x overscroll-x-contain");
      expect(code).toContain('WebkitOverflowScrolling: "touch"');
    });
  });
});
