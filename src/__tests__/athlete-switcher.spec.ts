import { beforeEach, describe, expect, it } from "vitest";
import { useAthleteStore } from "@/store/use-athlete-store";
import * as fs from "fs";
import * as path from "path";

describe("Conmutador de Vista de Alumno (Fernando Rosales vs Gabriel Sánchez)", () => {
  const inicioMisDiasPath = path.resolve(__dirname, "../components/athlete/inicio-mis-dias.tsx");
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const storePath = path.resolve(__dirname, "../store/use-athlete-store.ts");

  const inicioCode = fs.readFileSync(inicioMisDiasPath, "utf-8");
  const liveCode = fs.readFileSync(liveWorkoutPath, "utf-8");
  const storeCode = fs.readFileSync(storePath, "utf-8");

  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
  });

  it("inicio-mis-dias y live-workout exponen el selector con testids y nombres requeridos", () => {
    expect(inicioCode).toContain('data-testid="athlete-switcher-container"');
    expect(inicioCode).toContain('data-testid="athlete-switcher-fernando"');
    expect(inicioCode).toContain('data-testid="athlete-switcher-gabriel"');
    expect(inicioCode).toContain("Fernando Rosales");
    expect(inicioCode).toContain("Gabriel Sánchez (yo, gabi)");

    expect(liveCode).toContain('data-testid="athlete-switcher-container"');
    expect(liveCode).toContain('data-testid="athlete-switcher-fernando"');
    expect(liveCode).toContain('data-testid="athlete-switcher-gabriel"');
    expect(liveCode).toContain("Fernando Rosales");
    expect(liveCode).toContain("Gabriel Sánchez (yo, gabi)");
  });

  it("permite conmutar fluidamente entre Fernando Rosales y Gabriel Sánchez", () => {
    const store = useAthleteStore.getState();

    // Default es Fernando Rosales
    expect(store.currentSession.studentName).toBe("Fernando Rosales");
    expect(store.currentSession.nombre_rutina).toContain("DIA 1");

    // Conmutar a Gabriel Sánchez
    store.loadStudentSession("0a7a4dfd-e040-4b92-ac29-9507cbb13215");
    const sessionGabi = useAthleteStore.getState().currentSession;
    expect(sessionGabi.studentName).toBe("Gabriel Sanchez");
    expect(sessionGabi.nombre_rutina).toContain("WARM UP");
    expect(sessionGabi.ejercicios.length).toBeGreaterThan(0);

    // Conmutar de vuelta a Fernando Rosales
    store.loadStudentSession("66b92b9a-1ce7-4e2e-a47c-7c5600000000");
    const sessionFer = useAthleteStore.getState().currentSession;
    expect(sessionFer.studentName).toBe("Fernando Rosales");
    expect(sessionFer.nombre_rutina).toContain("DIA 1");
  });

  it("la configuración de rehidratación en store sanea sesiones ajenas a Fernando o Gabriel", () => {
    expect(storeCode).toContain("onRehydrateStorage");
    expect(storeCode).toContain('studentName.includes("Fernando Rosales")');
    expect(storeCode).toContain('studentName.includes("Gabriel")');
  });
});
