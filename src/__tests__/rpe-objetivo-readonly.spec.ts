import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Athlete App: RPE objetivo fijo y de solo lectura prescrito por el entrenador (GH #185, GOZS-179)", () => {
  const ejercicioActivoPath = path.resolve(__dirname, "../components/athlete/ejercicio-activo.tsx");
  const iconsPath = path.resolve(__dirname, "../components/athlete/icons.tsx");

  const ejercicioActivoCode = fs.readFileSync(ejercicioActivoPath, "utf-8");
  const iconsCode = fs.readFileSync(iconsPath, "utf-8");

  describe("Criterio Gherkin 1: RPE como valor inmutable prescrito por el entrenador", () => {
    it("presenta el badge de RPE objetivo prescrito por el coach en solo lectura (02-pantallas.md §3)", () => {
      expect(ejercicioActivoCode).toContain('data-testid="input-rpe"');
      expect(ejercicioActivoCode).toContain('data-testid="rpe-prescribed-badge"');
      expect(ejercicioActivoCode).toContain("{ej.rpe_objetivo ?? serie.rpe_real}");
      expect(ejercicioActivoCode).toContain("lo prescribe tu coach");
    });

    it("conserva el ícono de bloqueo (Lock) en icons.tsx y sin dependencias externas", () => {
      expect(iconsCode).toContain("export function Lock");
      expect(ejercicioActivoCode).toContain('from "@/components/athlete/icons"');
    });

    it("muestra el bloque informativo de RPE objetivo fijado por el coach", () => {
      expect(ejercicioActivoCode).toContain("RPE objetivo");
      expect(ejercicioActivoCode).toContain("lo prescribe tu coach");
    });
  });

  describe("Criterio Gherkin 2: Eliminación total de steppers interactivos de modificación (−0.5 / +0.5)", () => {
    it("elimina los botones de incremento y decremento de RPE (-0.5 y +0.5)", () => {
      expect(ejercicioActivoCode).not.toContain("−0.5");
      expect(ejercicioActivoCode).not.toContain("+0.5");
      expect(ejercicioActivoCode).not.toContain("handleAdjustRpe");
    });
  });

  describe("Criterio Gherkin 3: Conservación de métricas avanzadas y jerarquía de vistas", () => {
    it("mantiene visible el cálculo de 1RM estimado junto al RPE objetivo", () => {
      expect(ejercicioActivoCode).toContain("Math.round(serie.estimated1RM)");
      expect(ejercicioActivoCode).toContain("1RM estimado");
      expect(ejercicioActivoCode).toContain("RPE objetivo");
    });

    it("se ubica dentro de la sección técnica exclusiva y permanece oculta en Vista Simple", () => {
      expect(ejercicioActivoCode).toContain("!isSimpleView && !esTiempo && (");
    });
  });
});
