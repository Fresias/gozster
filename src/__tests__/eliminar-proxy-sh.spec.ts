import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("GOZS-240: Eliminar el proxy de score de salud (SH) del dashboard", () => {
  const coachStudioViewPath = path.resolve(
    __dirname,
    "../components/coach/coach-studio-view.tsx"
  );
  const studentCardPath = path.resolve(
    __dirname,
    "../components/coach/student-card.tsx"
  );

  const viewContent = fs.readFileSync(coachStudioViewPath, "utf-8");
  const cardContent = fs.readFileSync(studentCardPath, "utf-8");

  describe("Criterio de Aceptación Gherkin", () => {
    it("GIVEN el dashboard WHEN se carga THEN no hay rastro del proxy SH en UI ni código muerto asociado", () => {
      // 1. Sin columna ni encabezado en la tabla de atletas
      expect(viewContent).not.toContain("Score Salud [SH]");
      expect(viewContent).not.toContain("Score Salud");

      // 2. Sin código de cálculo ni variables proxy de SH
      expect(viewContent).not.toContain("shScore");
      expect(viewContent).not.toContain("shColorClass");
      expect(viewContent).not.toContain("calculateStudentHealthScore");

      // 3. Sin micro-badge tonal de healthScore
      expect(viewContent).not.toMatch(/\[\s*\{\s*Math\.round\(healthScore\.score\)\s*\}\s*\]/);

      // 4. El colSpan del estado vacío se ajustó a 6 columnas
      expect(viewContent).toContain('colSpan={6}');
      expect(viewContent).not.toContain('colSpan={7}');
    });

    it("la vista en tarjetas (StudentCard) tampoco expone el proxy SH", () => {
      expect(cardContent).not.toContain("SH:");
      expect(cardContent).not.toContain("calculateStudentHealthScore");
      expect(cardContent).not.toContain("Semáforo de Salud");
    });
  });
});
