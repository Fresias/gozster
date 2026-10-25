import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";

describe("Selector de Ejercicios en 1 Columna (Opción B / GH #172 / GOZS-168)", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const liveCode = fs.readFileSync(liveWorkoutPath, "utf-8");

  it("elimina los textos redundantes 'tocá para cambiar de máquina' y 'Ejercicios del día'", () => {
    expect(liveCode).not.toContain("tocá para cambiar de máquina");
    expect(liveCode).not.toContain("<span>Ejercicios del día</span>");
  });

  it("implementa la estructura en 1 columna completa con data-testid='exercise-selector-column'", () => {
    expect(liveCode).toContain('data-testid="exercise-selector-column"');
    expect(liveCode).toContain('className="flex flex-col gap-1.5"');
  });

  it("elimina la repetición de 'series' en el texto prescripto de cada botón", () => {
    expect(liveCode).not.toContain("series · {ej.repeticiones_objetivo}");
    expect(liveCode).toContain("{ej.repeticiones_objetivo}");
  });

  it("incluye el ordinal visual separado para no recortar el nombre del ejercicio", () => {
    expect(liveCode).toContain("h-6 w-6 rounded-lg text-xs font-mono");
    expect(liveCode).toContain("data-testid={`exercise-select-btn-${ej.id}`}");
  });

  it("soporta fluidamente la rutina de Fernando Rosales (8 ejercicios en columna)", () => {
    const store = useAthleteStore.getState();
    store.loadStudentSession("Fernando Rosales");
    const session = useAthleteStore.getState().currentSession;

    expect(session.studentName).toContain("Fernando Rosales");
    expect(session.ejercicios.length).toBe(8);
  });

  it("soporta fluidamente la rutina de Gabriel Sánchez (Warm up de 2 ejercicios en columna)", () => {
    const store = useAthleteStore.getState();
    store.loadStudentSession("Gabriel Sanchez");
    const session = useAthleteStore.getState().currentSession;

    expect(session.studentName).toContain("Gabriel");
    expect(session.ejercicios.length).toBe(2);
  });
});
