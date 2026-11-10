import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("GOZS-457 / GOZS-456: Protocolo de Observabilidad y Métricas Agregadas en Sub-Issues", () => {
  const docPath = path.resolve(__dirname, "../../docs/architecture/observability-subissues.md");
  const packageJsonPath = path.resolve(__dirname, "../../package.json");

  it("GIVEN la documentación de observabilidad WHEN se verifica su ubicación THEN existe docs/architecture/observability-subissues.md", () => {
    expect(fs.existsSync(docPath)).toBe(true);
  });

  it("GIVEN la guía de extracción WHEN se audita el contenido THEN documenta 'Include sub-issues' y 'scope=subtree'", () => {
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content).toContain("Include sub-issues");
    expect(content).toContain("scope=subtree");
    expect(content).toContain("GET /api/issues/{id}/task-runs?scope=subtree");
  });

  it("GIVEN el formato de reporte THEN incluye tabla consolidada con Runs, Timeline, Tokens y Costo", () => {
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content).toContain("Total Runs");
    expect(content).toContain("Tokens Consumidos");
    expect(content).toContain("Costo Acumulado");
    expect(content).toContain("Timeline Resumido de Ejecución");
  });

  it("GIVEN los principios Ponytail y Karpathy THEN se prohíbe bloatware y dependencias npm superfluas", () => {
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content).toContain("Ponytail");
    expect(content).toContain("Karpathy");
    expect(content).toContain("Anti-Token-Waste");

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    expect(deps).not.toHaveProperty("axios");
    expect(deps).not.toHaveProperty("lodash");
  });

  it("GIVEN los criterios de aceptación WHEN se evalúa el documento THEN contiene los escenarios Gherkin formales", () => {
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content).toContain("Feature: Observabilidad de Runs y Consumo en Árboles de Sub-Issues");
    expect(content).toContain("Scenario: Auditoría consolidada de un feature con sub-issues en múltiples etapas");
    expect(content).toContain("Scenario: Validación de reporte final de entrega libre de bloatware");
  });
});
