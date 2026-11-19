import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { useAthleteStore } from "@/store/use-athlete-store";
import { getPainBannerConfig } from "@/components/athlete/pain-banner";

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
    it("WHEN envía reporte de dolor 1-3 THEN guarda molestia leve en currentSession.molestias y genera el cartel neutro", async () => {
      const molestia = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-1",
        ejercicioId: "ej-curl-biceps",
        numeroSerie: 1,
        zona: "CODO",
        eva: 2,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Ligera tensión en tendón",
      });

      const molestias = useAthleteStore.getState().currentSession.molestias ?? [];
      expect(molestias).toHaveLength(1);
      expect(molestias[0]?.id).toBe(molestia.id);
      expect(molestias[0]?.nivel).toBe("leve");

      const banner = getPainBannerConfig(molestia.eva, {
        exerciseName: "Curl de Bíceps",
        sintomasAlarma: molestia.sintomas,
      });
      expect(banner.range).toBe("1-3");
      expect(banner.variant).toBe("neutral");
      expect(banner.testId).toBe("pain-banner-range-1-3");
      expect(banner.message).toContain("sin colores de alerta");
    });

    it("WHEN envía reporte de dolor 4-6 THEN guarda molestia moderada y genera el cartel amarillo", async () => {
      const molestia = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-2",
        ejercicioId: "ej-press-militar",
        numeroSerie: 2,
        zona: "HOMBRO",
        eva: 5,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Molestia en el deltoides al empujar",
      });

      const molestias = useAthleteStore.getState().currentSession.molestias ?? [];
      expect(molestias[0]?.nivel).toBe("moderada");

      const banner = getPainBannerConfig(molestia.eva, {
        exerciseName: "Press Militar con Mancuernas",
        sintomasAlarma: molestia.sintomas,
      });
      expect(banner.range).toBe("4-6");
      expect(banner.variant).toBe("warning");
      expect(banner.testId).toBe("pain-banner-range-4-6");
      expect(banner.message).toContain("recomienda reducir peso si continúa");
    });

    it("WHEN envía reporte de dolor 7-9 THEN guarda molestia alta y genera el cartel rojo a prueba de errores", async () => {
      const molestia = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-3",
        ejercicioId: "ej-sentadilla-bulgara",
        numeroSerie: 3,
        zona: "RODILLA",
        eva: 8,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Dolor punzante en rótula",
      });

      const molestias = useAthleteStore.getState().currentSession.molestias ?? [];
      expect(molestias[0]?.nivel).toBe("alta");

      const banner = getPainBannerConfig(molestia.eva, {
        exerciseName: "Sentadilla Búlgara",
        sintomasAlarma: molestia.sintomas,
      });
      expect(banner.range).toBe("7-9");
      expect(banner.variant).toBe("destructive");
      expect(banner.testId).toBe("pain-banner-range-7-9");
      expect(banner.message).toContain("suspender ese ejercicio");
      expect(banner.message).toContain("no debe invitar a seguir");
    });

    it("WHEN envía reporte de dolor 10 THEN guarda molestia de alarma y genera el cartel rojo de parada total", async () => {
      const molestia = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-4",
        ejercicioId: "ej-peso-muerto-rumano",
        numeroSerie: 1,
        zona: "LUMBAR",
        eva: 10,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Dolor agudo insoportable",
      });

      const molestias = useAthleteStore.getState().currentSession.molestias ?? [];
      expect(molestias[0]?.nivel).toBe("alarma");
      expect(useAthleteStore.getState().stopProtocolActive).toBe(true);

      const banner = getPainBannerConfig(molestia.eva, {
        exerciseName: "Peso Muerto Rumano",
        sintomasAlarma: molestia.sintomas,
      });
      expect(banner.range).toBe("10");
      expect(banner.variant).toBe("destructive");
      expect(banner.testId).toBe("pain-banner-range-10");
      expect(banner.message).toContain("cesar el entrenamiento y contactar al entrenador");
    });

    it("limpia currentSession.molestias al reiniciar la sesión con resetSessionToDefaults", async () => {
      await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-5",
        ejercicioId: "ej-cadera",
        zona: "CADERA",
        eva: 3,
        momento: "CALENTAMIENTO",
        sintomas: [],
        notas: "",
      });
      expect(useAthleteStore.getState().currentSession.molestias).toHaveLength(1);

      useAthleteStore.getState().resetSessionToDefaults();
      expect(useAthleteStore.getState().currentSession.molestias).toEqual([]);
    });
  });

  describe("3. Código Fuente y Ergonomía Visual en Componentes UI", () => {
    const liveWorkoutCode = readSource("../components/athlete/live-workout.tsx");
    const painModalCode = readSource("../components/athlete/pain-report-modal.tsx");
    const painBannerCode = readSource("../components/athlete/pain-banner.tsx");

    it("LiveWorkout renderiza PainReportBanner desde currentSession.molestias y vincula reportarMolestia", () => {
      expect(liveWorkoutCode).toContain("PainReportBanner");
      expect(liveWorkoutCode).toContain("derivedPainBanner");
      expect(liveWorkoutCode).toContain("setDismissedMolestiaId");
      expect(liveWorkoutCode).toContain("reportarMolestia");
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
