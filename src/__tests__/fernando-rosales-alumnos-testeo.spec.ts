import { sembrarPlanAlumno } from "./helpers/plan-alumno-seed";
import { describe, expect, it, beforeEach } from "vitest";
import { useAthleteStore, DEFAULT_ATHLETE_ID, DEFAULT_ATHLETE_NAME } from "@/store/use-athlete-store";
import {
  REAL_ALUMNOS,
  REAL_PLANES,
  REAL_DIAS,
  REAL_HISTORIAL_CARGAS,
} from "@/services/real-mynter-data";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import * as fs from "fs";
import * as path from "path";

describe("GH #165 / GOZS-166: Rutina de Fernando Rosales por defecto y dataset real en Modo Testeo", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
  });

  describe("Criterio 1: Rutina de Fernando Rosales por defecto en Athlete App", () => {
    it("la sesión por defecto inicial pertenece a Fernando Rosales y es DIA 1 de F Y H FER ROSALES", () => {
      const { currentSession } = useAthleteStore.getState();

      expect(currentSession.studentName).toBe("Fernando Rosales");
      expect(currentSession.studentId).toBe("66b92b9a-1ce7-4e2e-a47c-7c5600000000");
      expect(currentSession.nombre_rutina).toContain("Fernando Rosales");
      expect(currentSession.nombre_rutina).toContain("DIA 1");
      expect(currentSession.nombre_rutina).toContain("F Y H FER ROSALES");
    });

    it("contiene los 8 ejercicios prescritos de DIA 1 con sus repeticiones, RPE y descansos", () => {
      const { currentSession } = useAthleteStore.getState();
      expect(currentSession.ejercicios.length).toBe(8);

      // Warm up
      const warmup = currentSession.ejercicios.find(
        (e) => e.nombre.includes("Sentadilla isométrica")
      );
      expect(warmup).toBeDefined();
      expect(warmup?.rpe_objetivo).toBe(6);
      expect(warmup?.series.length).toBe(3);

      // Press Plano con Barra (4 series descendentes)
      const pressPlano = currentSession.ejercicios.find(
        (e) => e.nombre.includes("Press") && e.nombre.includes("Plano")
      );
      expect(pressPlano).toBeDefined();
      expect(pressPlano?.series.length).toBe(4);
      expect(pressPlano?.descanso_segundos).toBe(120);
      expect(pressPlano?.url_video).toBe("rT7DgCr-3pg");

      // Sentadilla Trasera con Barra
      const sentadilla = currentSession.ejercicios.find(
        (e) => e.nombre === "Sentadilla Trasera con Barra"
      );
      expect(sentadilla).toBeDefined();
      expect(sentadilla?.series.length).toBe(4);
      expect(sentadilla?.url_video).toBe("bEv6CCg2BC8");

      // Extensión tríceps barra V con DROP-SET
      const triceps = currentSession.ejercicios.find(
        (e) => e.nombre.includes("Extensión de tríceps barra V")
      );
      expect(triceps).toBeDefined();
      expect(triceps?.repeticiones_objetivo).toBe("DROP-SET");
      expect(triceps?.rpe_objetivo).toBe(10);
      expect(triceps?.url_video).toBe("v7f6PjSAO-4");
    });

    it("permite navegar por los 4 días de la rutina de Fernando Rosales", () => {
      const ferDias = REAL_DIAS.filter(
        (d) => d.plan_id === "6a669097-5bd8-4547-87f7-a43300000000"
      );
      expect(ferDias.length).toBe(4);
      expect(ferDias.map((d) => d.nombre)).toEqual(["DIA 1", "DIA 2", "DIA 3", "DIA 4"]);

      // Cargar DIA 2
      sembrarPlanAlumno("Fernando Rosales");
      const loaded = useAthleteStore
        .getState()
        .loadStudentSession("Fernando Rosales", ferDias[1]!.id);
      expect(loaded).toBe(true);

      const sessionDia2 = useAthleteStore.getState().currentSession;
      expect(sessionDia2.dia_id).toBe(ferDias[1]!.id);
      expect(sessionDia2.nombre_rutina).toContain("DIA 2");
    });

    it("resetSessionToDefaults restablece fielmente a Fernando Rosales DIA 1", () => {
      // Alterar sesión
      sembrarPlanAlumno("Gabriel Sanchez");
      useAthleteStore.getState().loadStudentSession("Gabriel Sanchez");
      expect(useAthleteStore.getState().currentSession.studentName).toContain("Gabriel");

      // Resetear
      useAthleteStore.getState().resetSessionToDefaults();
      const state = useAthleteStore.getState();
      expect(state.currentSession.studentName).toBe("Fernando Rosales");
      expect(state.currentSession.nombre_rutina).toContain("DIA 1");
    });
  });

  describe("Criterio 2: Carga de alumnos reales y registros en entorno de TESTEO", () => {
    it("los alumnos reales están presentes en REAL_ALUMNOS con Fernando Rosales como primero", () => {
      expect(REAL_ALUMNOS[0]!.nombre_completo).toBe("Fernando Rosales");
      expect(REAL_ALUMNOS[0]!.email).toBe("feerrosales97@gmail.com");

      const nombresReales = REAL_ALUMNOS.map((a) => a.nombre_completo);
      expect(nombresReales).toContain("Fernando Rosales");
      expect(nombresReales).toContain("Gabriel Sanchez");
      expect(nombresReales).toContain("Michelle Roach");
      expect(nombresReales).toContain("Agustin Scarafioca");
      expect(nombresReales).toContain("Celeste Gerardi");
    });

    it("los alumnos reales poseen historial de cargas y sesiones reales", () => {
      const ferId = "66b92b9a-1ce7-4e2e-a47c-7c5600000000";
      expect(REAL_HISTORIAL_CARGAS[ferId]).toBeDefined();
      expect(REAL_HISTORIAL_CARGAS[ferId]!.length).toBeGreaterThan(0);

      // Michelle Roach tiene sesiones históricas de Mynter
      const michelleId = "9015b7d8-7118-4912-aa01-0fb6e62848c6";
      expect(REAL_HISTORIAL_CARGAS[michelleId]).toBeDefined();
      expect(REAL_HISTORIAL_CARGAS[michelleId]!.length).toBeGreaterThan(0);

      const primerSesion = REAL_HISTORIAL_CARGAS[michelleId]![0]!;
      expect(primerSesion!.sesion.volumen_total_kg).toBeGreaterThan(0);
      expect(primerSesion!.series.length).toBeGreaterThan(0);
      expect(primerSesion!.series[0]!.ejercicioNombre).toBeDefined();
    });
  });

  describe("Criterio 3: Ficha detallada del alumno (student-detail.tsx)", () => {
    it("la pestaña de Registros existe en la interfaz de student-detail.tsx", () => {
      const studentDetailSource = fs.readFileSync(
        path.join(process.cwd(), "src/components/coach/student-detail.tsx"),
        "utf8"
      );

      expect(studentDetailSource).toContain('data-testid="tab-registros-sesiones"');
      expect(studentDetailSource).toContain('data-testid="panel-registros-sesiones"');
      expect(studentDetailSource).toContain("Registros de Entrenamiento & Cargas");
      expect(studentDetailSource).toContain("Ver Gráficos 1RM");
    });

    it("el conmutador de pestañas soporta 'registros_sesiones'", () => {
      const studioStore = useCoachStudioStore.getState();
      studioStore.setActiveTab("registros_sesiones");
      expect(useCoachStudioStore.getState().activeTab).toBe("registros_sesiones");
    });
  });
  describe("Criterio 4: Saneamiento y migración automática de caché local (v2)", () => {
    it("exporta constantes por defecto vinculadas a Fernando Rosales", () => {
      expect(DEFAULT_ATHLETE_ID).toBe("66b92b9a-1ce7-4e2e-a47c-7c5600000000");
      expect(DEFAULT_ATHLETE_NAME).toBe("Fernando Rosales");
    });

    it("la configuración de persistencia en use-athlete-store tiene versión 2 y función de migración", () => {
      const source = fs.readFileSync(
        path.join(process.cwd(), "src/store/use-athlete-store.ts"),
        "utf8"
      );

      expect(source).toContain('name: "gozster-athlete-store"');
      expect(source).toContain("version: 2");
      expect(source).toContain("migrate: (persistedState: any, version: number)");
    });

    it("los componentes del atleta no tienen fallbacks residuales a Celeste Gerardi", () => {
      const liveWorkoutSrc = fs.readFileSync(
        path.join(process.cwd(), "src/components/athlete/live-workout.tsx"),
        "utf8"
      );
      const cuestionarioSrc = fs.readFileSync(
        path.join(process.cwd(), "src/components/athlete/cuestionario-inicial.tsx"),
        "utf8"
      );
      const inicioMisDiasSrc = fs.readFileSync(
        path.join(process.cwd(), "src/components/athlete/inicio-mis-dias.tsx"),
        "utf8"
      );

      expect(liveWorkoutSrc).not.toContain('"Celeste Gerardi"');
      expect(cuestionarioSrc).not.toContain('"Celeste Gerardi"');
      expect(inicioMisDiasSrc).not.toContain('"Celeste"');
    });
  });
});
