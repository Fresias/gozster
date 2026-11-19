import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { CierreDiaModal, type RecordSesionItem } from "@/components/athlete/cierre-dia-modal";

describe("Athlete App: Pantalla de Celebración y Estímulo de Cierre de Día (GOZS-174 / GH #180)", () => {
  const ejercicioActivoPath = path.resolve(__dirname, "../components/athlete/ejercicio-activo.tsx");
  const useLiveWorkoutPath = path.resolve(__dirname, "../components/athlete/use-live-workout.ts");
  const cierreDiaModalPath = path.resolve(__dirname, "../components/athlete/cierre-dia-modal.tsx");
  const athleteV7CssPath = path.resolve(__dirname, "../app/(athlete)/athlete/athlete-v7.css");

  const ejercicioActivoCode = fs.readFileSync(ejercicioActivoPath, "utf-8");
  const useLiveWorkoutCode = fs.readFileSync(useLiveWorkoutPath, "utf-8");
  const cierreDiaModalCode = fs.readFileSync(cierreDiaModalPath, "utf-8");
  const athleteV7CssCode = fs.readFileSync(athleteV7CssPath, "utf-8");

  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });

    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setMembershipStatus("ACTIVE");
    useAthleteStore.getState().stopTimer();
    useAthleteStore.getState().setMostrarTimerDescanso(true);
    vi.restoreAllMocks();
  });

  describe("Criterio Gherkin 1: Despliegue de modal de celebración con animación limpia y soporte estricto de prefers-reduced-motion: reduce", () => {
    it("GIVEN CierreDiaModal con isOpen=false, THEN no renderiza nada", () => {
      const html = renderToString(
        React.createElement(CierreDiaModal, {
          isOpen: false,
          onClose: () => {},
          tonelajeKg: 14250,
          seriesCompletadas: 26,
          totalSeries: 26,
        })
      );
      expect(html).toBe("");
    });

    it("GIVEN CierreDiaModal con isOpen=true, THEN renderiza modal accesible con soporte estricto para prefers-reduced-motion: reduce", () => {
      const html = renderToString(
        React.createElement(CierreDiaModal, {
          isOpen: true,
          onClose: () => {},
          tonelajeKg: 14250,
          seriesCompletadas: 26,
          totalSeries: 26,
          duracionMinutos: 45,
          rachaDias: 5,
          rachaPrevia: 4,
          metaDiasSemana: 4,
          diasCompletadosSemana: 1,
        })
      );

      // Accesibilidad estándar de diálogo v7
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('data-testid="cierre-dia-modal"');
      expect(html).toContain('data-testid="cierre-dia-card"');
      expect(html).toContain('data-testid="cierre-dia-titulo"');
      expect(html).toContain('a-dk a-dk-cierre');

      // Soporte estricto de accesibilidad para prefers-reduced-motion en athlete-v7.css
      expect(athleteV7CssCode).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
      expect(athleteV7CssCode).toContain("animation: none !important;");
      expect(cierreDiaModalCode).not.toContain("🏆");
    });

    it("GIVEN EjercicioActivo + useLiveWorkout, THEN integra CierreDiaModal y dispara la apertura al concluir el guardado", () => {
      expect(ejercicioActivoCode).toContain("import { CierreDiaModal");
      expect(ejercicioActivoCode).toContain("<CierreDiaModal");
      expect(useLiveWorkoutCode).toContain("setShowCelebrationModal(true)");
      expect(ejercicioActivoCode).toContain("showCelebrationModal");
    });
  });

  describe("Criterio Gherkin 2: Resumen destacado de sesión y Poda de Tonelaje Kg (GOZS-359)", () => {
    it("GIVEN una sesión finalizada con 26/26 series y 45 min, THEN muestra series y tiempo y no figura el texto ni el valor del tonelaje/volumen total en kg", () => {
      const html = renderToString(
        React.createElement(CierreDiaModal, {
          isOpen: true,
          onClose: () => {},
          tonelajeKg: 14250,
          seriesCompletadas: 26,
          totalSeries: 26,
          duracionMinutos: 45,
        })
      );

      // Poda de Tonelaje Total Acumulado según GOZS-359
      expect(html).toContain('data-testid="hero-metric-summary-card"');
      expect(html).not.toContain('data-testid="hero-metric-tonelaje"');
      expect(html).not.toContain("Tonelaje Total Acumulado");
      expect(html).not.toContain("Volumen total levantado");
      expect(html).not.toContain("14.250 kg");

      // Series completadas
      expect(html).toContain('data-testid="hero-metric-series"');
      expect(html).toContain("26/26");

      // Duración de la sesión en formato v7 (minutos')
      expect(html).toContain('data-testid="hero-metric-tiempo"');
      expect(html).toContain("45&#x27;");
    });

    it("GIVEN una sesión con valores dinámicos calculados, THEN no exhibe métrica de tonelaje y mantiene métricas operativas", () => {
      const html = renderToString(
        React.createElement(CierreDiaModal, {
          isOpen: true,
          onClose: () => {},
          tonelajeKg: 8613,
          seriesCompletadas: 26,
          totalSeries: 26,
          duracionMinutos: 52,
        })
      );

      expect(html).not.toContain("8.613 kg");
      expect(html).toContain("26/26");
      expect(html).toContain("52&#x27;");
    });
  });

  describe("Criterio Gherkin 3: Exhibición de Racha Semanal y eliminación de Ranking de Constancia (D-33)", () => {
    it("GIVEN una racha semanal y meta semanal, THEN muestra 'Racha semanal: X de Y días' sin ranking de constancia (D-33)", () => {
      const html = renderToString(
        React.createElement(CierreDiaModal, {
          isOpen: true,
          onClose: () => {},
          tonelajeKg: 14250,
          seriesCompletadas: 26,
          totalSeries: 26,
          rachaDias: 5,
          rachaPrevia: 4,
          metaDiasSemana: 4,
          diasCompletadosSemana: 1,
        })
      );

      // Card de Racha Semanal
      expect(html).toContain('data-testid="cierre-dia-racha-card"');
      expect(html).toContain('data-testid="racha-dias-valor"');
      expect(html).toContain("Racha semanal: 1 de 4 días");

      // Explicación v7 de racha semanal
      expect(html).toContain('data-testid="meta-semanal-avance"');
      expect(html).toContain("Cuenta solo los días de tu plan; el descanso no la corta.");

      // D-33: sin ranking de constancia en el cierre
      expect(html).not.toContain('data-testid="cierre-dia-ranking-constancia"');
      expect(html).not.toContain("Impacto en Ranking de Constancia");
    });
  });

  describe("Criterio Gherkin 4: Distintivo dorado para nuevos récords personales (PRs) obtenidos durante la sesión", () => {
    it("GIVEN una sesión SIN nuevos récords, THEN no despliega la sección de PRs innecesariamente", () => {
      const html = renderToString(
        React.createElement(CierreDiaModal, {
          isOpen: true,
          onClose: () => {},
          tonelajeKg: 14250,
          seriesCompletadas: 26,
          totalSeries: 26,
          recordsObtenidos: [],
        })
      );

      expect(html).not.toContain('data-testid="cierre-dia-prs-section"');
    });

    it("GIVEN una sesión CON nuevos récords personales (PRs), THEN los lista con distintivo dorado y datos de carga", () => {
      const recordsMock: RecordSesionItem[] = [
        {
          exerciseName: "Sentadilla Trasera con Barra",
          peso_kg: 140,
          reps_hechas: 5,
          tipo: "peso",
          epley_kg: 163,
          delta_epley_kg: 5,
          numero_serie: 4,
        },
        {
          exerciseName: "Press de Banca Plano",
          peso_kg: 105,
          reps_hechas: 3,
          tipo: "peso",
          epley_kg: 115,
          delta_epley_kg: 2,
          numero_serie: 4,
        },
      ];

      const html = renderToString(
        React.createElement(CierreDiaModal, {
          isOpen: true,
          onClose: () => {},
          tonelajeKg: 14250,
          seriesCompletadas: 26,
          totalSeries: 26,
          recordsObtenidos: recordsMock,
        })
      );

      expect(html).toContain('data-testid="cierre-dia-prs-section"');
      expect(html).toContain("Nuevo PR · Sentadilla Trasera con Barra");
      expect(html).toContain("140 kg × 5");
      expect(html).toContain("Nuevo PR · Press de Banca Plano");
      expect(html).toContain("105 kg × 3");

      // Distintivo dorado único v7 (D-45: .a-prc sin border-amber-300 ni emoji)
      expect(html).toContain('data-testid="cierre-dia-pr-item-0"');
      expect(html).toContain('data-testid="cierre-dia-pr-badge-0"');
      expect(html).toContain('data-testid="cierre-dia-pr-item-1"');
      expect(html).toContain('data-testid="cierre-dia-pr-badge-1"');
      expect(html).toContain('class="a-prc"');
      expect(html).not.toContain("🏆");
    });
  });

  describe("Criterio Gherkin 5: Botón principal ergonómico para cerrar y volver a /athlete", () => {
    it("GIVEN CierreDiaModal abierto, THEN cuenta con botón ergonómico principal para volver al inicio", () => {
      const html = renderToString(
        React.createElement(CierreDiaModal, {
          isOpen: true,
          onClose: () => {},
          onVolverInicio: () => {},
          tonelajeKg: 14250,
          seriesCompletadas: 26,
          totalSeries: 26,
        })
      );

      // Botón principal v7 (.a-btn.a-dk-btn, >= 52px táctil)
      expect(html).toContain('data-testid="cierre-dia-volver-athlete-btn"');
      expect(html).toContain("Volver al inicio");
      expect(html).toContain('class="a-btn a-dk-btn"');
    });

    it("GIVEN un atleta completando el día en LiveWorkout, WHEN hace click en volver, THEN se limpia diaActivoId volviendo al inicio", () => {
      const diaId = "6a669097-5bd8-4547-87f7-a43700000001";
      useAthleteStore.setState({ diaActivoId: diaId });

      expect(useAthleteStore.getState().diaActivoId).toBe(diaId);

      // Al llamar a volverAlInicio (invocado por el botón del modal)
      useAthleteStore.getState().volverAlInicio();

      // Regresa a la pantalla de inicio del atleta (/athlete)
      expect(useAthleteStore.getState().diaActivoId).toBeNull();
    });
  });
});
