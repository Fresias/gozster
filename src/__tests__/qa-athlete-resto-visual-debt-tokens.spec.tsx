import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

describe("GOZS-505: Deuda visual en componentes de Athlete (Lote 1: texto < 12px y colores hardcodeados)", () => {
  const baseDir = path.resolve(__dirname, "../components/athlete");

  // Archivos de Lote 1 (Athlete resto):
  // Excluimos live-workout.tsx (pertenece a Stage 1 / GOZS-503)
  const filesToCheck = [
    "onboarding-alumno.tsx",
    "inicio-mis-dias.tsx",
    "historial-sesiones.tsx",
    "athlete-chat.tsx",
    "cierre-dia-modal.tsx",
    "nutrition-tracker.tsx",
    "plate-calculator-modal.tsx",
    "pain-report-modal.tsx",
    "warmup-modal.tsx",
    "cuestionario-inicial.tsx",
    "athlete-classes.tsx",
    "habit-tracker.tsx",
    "membership-paywall.tsx",
    "exercise-notes-modal.tsx",
    "exercise-video-modal.tsx",
    "pain-banner.tsx",
    "tooltip-1rm.tsx",
    "mi-progreso.tsx",
  ].map((name) => path.join(baseDir, name));

  it("GIVEN los componentes de Athlete (resto) THEN ninguno contiene clases de texto menor a 12px (text-[8px] a text-[11px])", () => {
    const smallTextRegex = /text-\[(8|9|10|11)px\]/g;
    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of filesToCheck) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const matches = lineText.match(smallTextRegex);
        if (matches) {
          violations.push({
            file: path.relative(baseDir, filePath),
            line: idx + 1,
            match: lineText.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Se encontraron clases con texto menor a 12px en Athlete:\n${JSON.stringify(violations, null, 2)}`
    ).toHaveLength(0);
  });

  it("GIVEN los componentes de Athlete (resto) THEN no contienen colores hardcodeados, salvo excepciones justificadas", () => {
    const hardcodedColorRegex =
      /#[0-9a-fA-F]{6}\b|rgba?\(|\b(bg|text|border|ring|fill|stroke|from|to|via)-(red|blue|green|emerald|amber|yellow|orange|sky|cyan|slate|zinc|gray|neutral|rose|indigo|violet|purple|teal|lime|pink)-\d{2,3}/g;
    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of filesToCheck) {
      if (!fs.existsSync(filePath)) continue;
      const fileName = path.basename(filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const matches = lineText.match(hardcodedColorRegex);
        if (!matches) return;

        // Filtro de excepciones justificadas del dominio y contratos de test preexistentes:
        // 1. plate-calculator-modal.tsx: Colores olímpicos estándar IPF para discos de halterofilia/powerlifting (función getPlateColor)
        if (fileName === "plate-calculator-modal.tsx" && idx + 1 >= 48 && idx + 1 <= 67) {
          return;
        }

        // 2. cierre-dia-modal.tsx: border-amber-300 requerido por aserción estricta de test en athlete-celebracion-cierre-dia.spec.ts:228
        if (fileName === "cierre-dia-modal.tsx" && lineText.includes("border-amber-300")) {
          return;
        }

        // 3. inicio-mis-dias.tsx: bg-[#38BDF8], text-[#0F172A], bg-[#0F172A] en hero/toast requeridos por test en athlete-inicio-mis-dias.spec.ts:43-45
        if (fileName === "inicio-mis-dias.tsx" && (lineText.includes("#0F172A") || lineText.includes("#38BDF8"))) {
          return;
        }

        violations.push({
          file: fileName,
          line: idx + 1,
          match: lineText.trim(),
        });
      });
    }

    expect(
      violations,
      `Se encontraron colores hardcodeados no justificados:\n${JSON.stringify(violations, null, 2)}`
    ).toHaveLength(0);
  });

  it("GIVEN los componentes de Athlete (resto) THEN utilizan tokens semánticos del sistema", () => {
    const onboarding = fs.readFileSync(path.join(baseDir, "onboarding-alumno.tsx"), "utf-8");
    const historial = fs.readFileSync(path.join(baseDir, "historial-sesiones.tsx"), "utf-8");
    const paywall = fs.readFileSync(path.join(baseDir, "membership-paywall.tsx"), "utf-8");
    const habits = fs.readFileSync(path.join(baseDir, "habit-tracker.tsx"), "utf-8");
    const classes = fs.readFileSync(path.join(baseDir, "athlete-classes.tsx"), "utf-8");

    // Validar adopción de tokens semánticos
    expect(onboarding).toContain("bg-primary");
    expect(onboarding).toContain("text-foreground");
    expect(onboarding).toContain("text-muted-foreground");
    expect(onboarding).toContain("border-border");

    expect(historial).toContain("bg-success-soft");
    expect(historial).toContain("text-success-soft-foreground");
    expect(historial).toContain("border-warning-soft-border");

    expect(paywall).toContain("bg-warning-soft");
    expect(paywall).toContain("text-warning-soft-foreground");
    expect(paywall).toContain("bg-success");

    expect(habits).toContain("bg-success-soft");
    expect(habits).toContain("bg-warning-soft");

    expect(classes).toContain("bg-success-soft");
    expect(classes).toContain("bg-danger-soft");
    expect(classes).toContain("bg-warning-soft");
  });
});
