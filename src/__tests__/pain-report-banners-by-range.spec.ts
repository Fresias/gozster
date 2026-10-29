import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { useAthleteStore } from "@/store/use-athlete-store";
import { getPainBannerConfig } from "@/components/athlete/pain-banner";
import type { PainReportData } from "@/components/athlete/pain-report-modal";

const readSource = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

describe("FE App: Carteles del reporte de dolor por rango (1-3, 4-6, 7-9, 10) (GOZS-278)", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
  });

  describe("1. Gherkin & Criterios de Aceptación por Rango", () => {
    // -------------------------------------------------------------------------
    // Rango 1-3
    // -------------------------------------------------------------------------
    it("Rango 1-3: genera aviso neutro de que se notifica al coach, sin colores de alerta", () => {
      [1, 2, 3].forEach((intensidad) => {
        const config = getPainBannerConfig(intensidad, { exerciseName: "Sentadilla" });
        expect(config.range).toBe("1-3");
        expect(config.variant).toBe("neutral");
        expect(config.testId).toBe("pain-banner-range-1-3");
        expect(config.message.toLowerCase()).toContain("aviso neutro");
        expect(config.message.toLowerCase()).toContain("se notifica al coach");
        expect(config.message.toLowerCase()).toContain("sin colores de alerta");
        expect(config.title).toContain("Rango 1-3");
      });
    });

    // -------------------------------------------------------------------------
    // Rango 4-6
    // -------------------------------------------------------------------------
    it("Rango 4-6: genera cartel amarillo que recomienda reducir peso si continúa", () => {
      [4, 5, 6].forEach((intensidad) => {
        const config = getPainBannerConfig(intensidad, { exerciseName: "Press de Banca" });
        expect(config.range).toBe("4-6");
        expect(config.variant).toBe("warning");
        expect(config.testId).toBe("pain-banner-range-4-6");
        expect(config.message.toLowerCase()).toContain("cartel amarillo");
        expect(config.message.toLowerCase()).toContain("recomienda reducir peso si continúa");
        expect(config.recommendation.toLowerCase()).toContain("recomienda reducir peso");
        expect(config.title).toContain("Rango 4-6");
      });
    });

    // -------------------------------------------------------------------------
    // Rango 7-9
    // -------------------------------------------------------------------------
    it("Rango 7-9: genera cartel rojo a prueba de errores con texto inequívoco sobre detenerse", () => {
      [7, 8, 9].forEach((intensidad) => {
        const config = getPainBannerConfig(intensidad, { exerciseName: "Peso Muerto" });
        expect(config.range).toBe("7-9");
        expect(config.variant).toBe("destructive");
        expect(config.testId).toBe("pain-banner-range-7-9");
        expect(config.message.toLowerCase()).toContain("cartel rojo a prueba de errores");
        expect(config.message.toLowerCase()).toContain("suspender ese ejercicio");
        expect(config.message.toLowerCase()).toContain("seguir con lo que no moleste");
        expect(config.message.toLowerCase()).toContain("no debe invitar a seguir");
        // Texto inequívoco sobre detenerse
        expect(config.recommendation.toLowerCase()).toContain("suspender de forma inequívoca");
        expect(config.title).toContain("Rango 7-9");
      });
    });

    // -------------------------------------------------------------------------
    // Rango 10
    // -------------------------------------------------------------------------
    it("Rango 10: genera cartel rojo con indicación inequívoca de cesar el entrenamiento y contactar al entrenador", () => {
      const config = getPainBannerConfig(10, { exerciseName: "Dominadas" });
      expect(config.range).toBe("10");
      expect(config.variant).toBe("destructive");
      expect(config.testId).toBe("pain-banner-range-10");
      expect(config.message.toLowerCase()).toContain("cartel rojo");
      expect(config.message.toLowerCase()).toContain("cesar el entrenamiento");
      expect(config.message.toLowerCase()).toContain("contactar al entrenador");
      // Texto inequívoco sobre detenerse
      expect(config.recommendation.toLowerCase()).toContain("cesar el entrenamiento de inmediato");
      expect(config.recommendation.toLowerCase()).toContain("detén por completo la sesión");
      expect(config.title).toContain("Rango 10");
    });
  });

  describe("2. Integración con useAthleteStore y Flujo de Envío (WHEN el alumno lo envía)", () => {
    it("WHEN envía reporte de dolor 1-3 THEN activa el cartel neutro en activePainBanner", async () => {
      const reportLeve: PainReportData = {
        exerciseId: "ej-1",
        exerciseName: "Curl de Bíceps",
        setNumber: 1,
        zonaArticular: "CODO",
        severidad: "LEVE",
        intensidadNumerica: 2,
        momentoAparicion: "EN_SERIE",
        sintomasAlarma: [],
        esSintomaAlarma: false,
        notasAlumno: "Ligera tensión en tendón",
      };

      await useAthleteStore.getState().reportPainEvent(reportLeve);

      const banner = useAthleteStore.getState().activePainBanner;
      expect(banner).not.toBeNull();
      expect(banner?.range).toBe("1-3");
      expect(banner?.variant).toBe("neutral");
      expect(banner?.testId).toBe("pain-banner-range-1-3");
      expect(banner?.message).toContain("sin colores de alerta");
    });

    it("WHEN envía reporte de dolor 4-6 THEN activa el cartel amarillo en activePainBanner", async () => {
      const reportModerado: PainReportData = {
        exerciseId: "ej-2",
        exerciseName: "Press Militar con Mancuernas",
        setNumber: 2,
        zonaArticular: "HOMBRO",
        severidad: "MODERADO",
        intensidadNumerica: 5,
        momentoAparicion: "EN_SERIE",
        sintomasAlarma: [],
        esSintomaAlarma: false,
        notasAlumno: "Molestia en el deltoides al empujar",
      };

      await useAthleteStore.getState().reportPainEvent(reportModerado);

      const banner = useAthleteStore.getState().activePainBanner;
      expect(banner).not.toBeNull();
      expect(banner?.range).toBe("4-6");
      expect(banner?.variant).toBe("warning");
      expect(banner?.testId).toBe("pain-banner-range-4-6");
      expect(banner?.message).toContain("recomienda reducir peso si continúa");
    });

    it("WHEN envía reporte de dolor 7-9 THEN activa el cartel rojo a prueba de errores", async () => {
      const reportAgudo: PainReportData = {
        exerciseId: "ej-3",
        exerciseName: "Sentadilla Búlgara",
        setNumber: 3,
        zonaArticular: "RODILLA",
        severidad: "AGUDO",
        intensidadNumerica: 8,
        momentoAparicion: "EN_SERIE",
        sintomasAlarma: [],
        esSintomaAlarma: false,
        notasAlumno: "Dolor punzante en rótula",
      };

      await useAthleteStore.getState().reportPainEvent(reportAgudo);

      const banner = useAthleteStore.getState().activePainBanner;
      expect(banner).not.toBeNull();
      expect(banner?.range).toBe("7-9");
      expect(banner?.variant).toBe("destructive");
      expect(banner?.testId).toBe("pain-banner-range-7-9");
      expect(banner?.message).toContain("suspender ese ejercicio");
      expect(banner?.message).toContain("no debe invitar a seguir");
    });

    it("WHEN envía reporte de dolor 10 THEN activa el cartel rojo de parada total", async () => {
      const reportExtremo: PainReportData = {
        exerciseId: "ej-4",
        exerciseName: "Peso Muerto Rumano",
        setNumber: 1,
        zonaArticular: "LUMBAR",
        severidad: "AGUDO",
        intensidadNumerica: 10,
        momentoAparicion: "EN_SERIE",
        sintomasAlarma: [],
        esSintomaAlarma: true,
        notasAlumno: "Dolor agudo insoportable",
      };

      await useAthleteStore.getState().reportPainEvent(reportExtremo);

      const banner = useAthleteStore.getState().activePainBanner;
      expect(banner).not.toBeNull();
      expect(banner?.range).toBe("10");
      expect(banner?.variant).toBe("destructive");
      expect(banner?.testId).toBe("pain-banner-range-10");
      expect(banner?.message).toContain("cesar el entrenamiento y contactar al entrenador");
    });

    it("permite descartar el banner con clearActivePainBanner", async () => {
      const report: PainReportData = {
        exerciseId: "ej-5",
        zonaArticular: "CADERA",
        severidad: "LEVE",
        intensidadNumerica: 3,
        momentoAparicion: "CALENTAMIENTO",
        sintomasAlarma: [],
        esSintomaAlarma: false,
        notasAlumno: "",
      };

      await useAthleteStore.getState().reportPainEvent(report);
      expect(useAthleteStore.getState().activePainBanner).not.toBeNull();

      useAthleteStore.getState().clearActivePainBanner();
      expect(useAthleteStore.getState().activePainBanner).toBeNull();
    });
  });

  describe("3. Código Fuente y Ergonomía Visual en Componentes UI", () => {
    const liveWorkoutCode = readSource("../components/athlete/live-workout.tsx");
    const painModalCode = readSource("../components/athlete/pain-report-modal.tsx");
    const painBannerCode = readSource("../components/athlete/pain-banner.tsx");

    it("LiveWorkout renderiza PainReportBanner y vincula activePainBanner y clearActivePainBanner", () => {
      expect(liveWorkoutCode).toContain("PainReportBanner");
      expect(liveWorkoutCode).toContain("activePainBanner");
      expect(liveWorkoutCode).toContain("clearActivePainBanner");
      expect(liveWorkoutCode).toContain("<PainReportBanner");
    });

    it("PainReportModal muestra los carteles informativos por rango (1-3, 4-6, 7-9, 10)", () => {
      expect(painModalCode).toContain('data-testid="pain-modal-cartel-1-3"');
      expect(painModalCode).toContain('data-testid="pain-modal-cartel-4-6"');
      expect(painModalCode).toContain('data-testid="pain-modal-cartel-7-9"');
      expect(painModalCode).toContain('data-testid="pain-modal-cartel-10"');

      expect(painModalCode).toContain("Aviso neutro de que se notifica al coach, sin colores de alerta");
      expect(painModalCode).toContain("Cartel amarillo, recomienda reducir peso si continúa");
      expect(painModalCode).toContain("Cartel rojo a prueba de errores: suspender ese ejercicio y cualquiera que acentúe el dolor");
      expect(painModalCode).toContain("Cartel rojo, cesar el entrenamiento y contactar al entrenador");
    });

    it("PainReportBanner define los estilos y testids exactos para los 4 rangos", () => {
      expect(painBannerCode).toContain('data-testid="pain-report-banner"');
      expect(painBannerCode).toContain("pain-banner-range-1-3");
      expect(painBannerCode).toContain("pain-banner-range-4-6");
      expect(painBannerCode).toContain("pain-banner-range-7-9");
      expect(painBannerCode).toContain("pain-banner-range-10");
      expect(painBannerCode).toContain('data-testid="dismiss-pain-banner-btn"');
    });
  });
});
