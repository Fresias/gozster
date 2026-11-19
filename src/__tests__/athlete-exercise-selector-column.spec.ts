import { sembrarPlanAlumno } from "./helpers/plan-alumno-seed";
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";

describe("Selector de Ejercicios en 1 Columna (Opción B / GH #172 / GOZS-168)", () => {
  // En v7 (FE-04), la lista de ejercicios vive en rutina-del-dia.tsx con filas .a-row.
  const rutinaPath = path.resolve(__dirname, "../components/athlete/rutina-del-dia.tsx");
  const rutinaCode = fs.readFileSync(rutinaPath, "utf-8");

  it("elimina los textos redundantes 'tocá para cambiar de máquina' y 'Ejercicios del día'", () => {
    expect(rutinaCode).not.toContain("tocá para cambiar de máquina");
    expect(rutinaCode).not.toContain("<span>Ejercicios del día</span>");
  });

  it("implementa la estructura en 1 columna completa con data-testid='exercise-selector-column'", () => {
    expect(rutinaCode).toContain('data-testid="exercise-selector-column"');
    expect(rutinaCode).toContain('className="flex flex-col gap-3"');
  });

  it("elimina la repetición de 'series' en el texto prescripto de cada botón", () => {
    expect(rutinaCode).not.toContain("series · {ej.repeticiones_objetivo}");
    expect(rutinaCode).toContain("ej.repeticiones_objetivo");
  });

  it("incluye el ordinal visual separado (.a-num) para no recortar el nombre del ejercicio", () => {
    expect(rutinaCode).toContain("a-num");
    expect(rutinaCode).toContain("data-testid={`exercise-select-btn-${ej.id}`}");
  });

  it("soporta fluidamente la rutina de Fernando Rosales (8 ejercicios en columna)", () => {
    const store = useAthleteStore.getState();
    sembrarPlanAlumno("Fernando Rosales");
    store.loadStudentSession("Fernando Rosales");
    const session = useAthleteStore.getState().currentSession;

    expect(session.studentName).toContain("Fernando Rosales");
    expect(session.ejercicios.length).toBe(8);
  });

  it("soporta fluidamente la rutina de Gabriel Sánchez (Warm up de 2 ejercicios en columna)", () => {
    const store = useAthleteStore.getState();
    sembrarPlanAlumno("Gabriel Sanchez");
    store.loadStudentSession("Gabriel Sanchez");
    const session = useAthleteStore.getState().currentSession;

    expect(session.studentName).toContain("Gabriel");
    expect(session.ejercicios.length).toBe(2);
  });
});
