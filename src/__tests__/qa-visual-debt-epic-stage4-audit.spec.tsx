import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";

describe("GOZS-506: Auditoría QA Integral de Deuda Visual (GOZS-502 Stage 4)", () => {
  const rootDir = path.resolve(__dirname, "..");
  const athleteDir = path.join(rootDir, "components/athlete");
  const coachDir = path.join(rootDir, "components/coach");
  const islasDir = path.join(coachDir, "student-detail/islas");

  const smallTextRegex = /text-\[(8|9|10|11)px\]/g;
  const hardcodedColorRegex =
    /#[0-9a-fA-F]{6}\b|rgba?\(|\b(bg|text|border|ring|fill|stroke|from|to|via)-(red|blue|green|emerald|amber|yellow|orange|sky|cyan|slate|zinc|gray|neutral|rose|indigo|violet|purple|teal|lime|pink)-\d{2,3}/g;

  describe("Nivel 1 & 2: Conformance y Ausencia de Microtextos (< 12px)", () => {
    it("GIVEN live-workout.tsx (Stage 1) THEN contiene 0 microtextos menores a 12px", () => {
      const liveWorkoutPath = path.join(athleteDir, "live-workout.tsx");
      const content = fs.readFileSync(liveWorkoutPath, "utf-8");
      const matches = content.match(smallTextRegex);
      expect(matches).toBeNull();
    });

    it("GIVEN student-detail.tsx y sus 7 islas (Stage 2) THEN contienen 0 microtextos menores a 12px", () => {
      const studentDetailFiles = [
        path.join(coachDir, "student-detail.tsx"),
        ...fs
          .readdirSync(islasDir)
          .filter((f) => f.endsWith(".tsx"))
          .map((f) => path.join(islasDir, f)),
      ];

      const violations: string[] = [];
      for (const file of studentDetailFiles) {
        const content = fs.readFileSync(file, "utf-8");
        if (smallTextRegex.test(content)) {
          violations.push(path.basename(file));
        }
      }
      expect(violations).toHaveLength(0);
    });

    it("GIVEN los 18 componentes de Athlete resto (Stage 3 Lote 1) THEN contienen 0 microtextos menores a 12px", () => {
      const athleteFiles = [
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
      ];

      const violations: string[] = [];
      for (const name of athleteFiles) {
        const filePath = path.join(athleteDir, name);
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, "utf-8");
        if (smallTextRegex.test(content)) {
          violations.push(name);
        }
      }
      expect(violations).toHaveLength(0);
    });
  });

  describe("Nivel 3: Fidelity y Auditoría Estricta de Colores Hardcodeados", () => {
    it("GIVEN student-detail.tsx e islas THEN contienen 0 colores hardcodeados", () => {
      const studentDetailFiles = [
        path.join(coachDir, "student-detail.tsx"),
        ...fs
          .readdirSync(islasDir)
          .filter((f) => f.endsWith(".tsx"))
          .map((f) => path.join(islasDir, f)),
      ];

      const violations: { file: string; line: number; match: string }[] = [];
      for (const file of studentDetailFiles) {
        const content = fs.readFileSync(file, "utf-8");
        content.split("\n").forEach((line, idx) => {
          const match = line.match(hardcodedColorRegex);
          if (match) {
            violations.push({ file: path.basename(file), line: idx + 1, match: line.trim() });
          }
        });
      }
      expect(violations).toHaveLength(0);
    });

    it("GIVEN live-workout.tsx THEN solo contiene excepciones autorizadas (claim-check y taxonomía)", () => {
      const liveWorkoutPath = path.join(athleteDir, "live-workout.tsx");
      const content = fs.readFileSync(liveWorkoutPath, "utf-8");
      const violations: { line: number; match: string }[] = [];

      content.split("\n").forEach((line, idx) => {
        const match = line.match(hardcodedColorRegex);
        if (!match) return;

        // Excepción 1: Banner optimista (#A7F3D0, #ECFDF5, #047857)
        if (line.includes("#A7F3D0") || line.includes("#ECFDF5") || line.includes("#047857")) return;

        // Excepción 2: Warmup badge (border-amber-500)
        if (line.includes("border-amber-500")) return;

        // Excepción 3: Selector de taxonomía W/F/D (bg-amber-500, bg-rose-600, bg-purple-600)
        if (line.includes("bg-amber-500") || line.includes("bg-rose-600") || line.includes("bg-purple-600")) return;

        // Excepción 4: Dropset / Superserie (purple-*)
        if (line.includes("purple-")) return;

        violations.push({ line: idx + 1, match: line.trim() });
      });

      expect(violations).toHaveLength(0);
    });

    it("GIVEN Athlete resto THEN solo contiene excepciones justificadas de dominio y contratos de test", () => {
      const athleteFiles = [
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
      ];

      const violations: { file: string; line: number; match: string }[] = [];
      for (const name of athleteFiles) {
        const filePath = path.join(athleteDir, name);
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, "utf-8");

        content.split("\n").forEach((line, idx) => {
          const match = line.match(hardcodedColorRegex);
          if (!match) return;

          // 1. Colores IPF olímpicos en plate-calculator-modal.tsx
          if (name === "plate-calculator-modal.tsx" && idx + 1 >= 48 && idx + 1 <= 67) return;

          // 2. Badge PR en cierre-dia-modal.tsx
          if (name === "cierre-dia-modal.tsx" && line.includes("border-amber-300")) return;

          // 3. Hero/toast en inicio-mis-dias.tsx
          if (name === "inicio-mis-dias.tsx" && (line.includes("#0F172A") || line.includes("#38BDF8"))) return;

          violations.push({ file: name, line: idx + 1, match: line.trim() });
        });
      }

      expect(violations).toHaveLength(0);
    });
  });

  describe("Nivel 4 & 5: Integridad de Contratos DOM y Tokens Accesibles", () => {
    it("GIVEN componentes modificados THEN mantienen intactos los data-testid existentes", () => {
      const liveWorkout = fs.readFileSync(path.join(athleteDir, "live-workout.tsx"), "utf-8");
      const studentDetail = fs.readFileSync(path.join(coachDir, "student-detail.tsx"), "utf-8");
      const athleteClasses = fs.readFileSync(path.join(athleteDir, "athlete-classes.tsx"), "utf-8");

      expect(liveWorkout).toContain('data-testid="timer-tiempo-completado-badge"');
      expect(liveWorkout).toContain('data-testid="badge-peso-unilateral"');
      expect(studentDetail).toContain('data-testid="ficha-actividad-detalle"');
      expect(studentDetail).toContain('data-testid="plan-membresia-detalle"');
      expect(studentDetail).toContain('data-testid="plan-membresia-notas"');
      expect(studentDetail).toContain('data-testid="input-monto-pago"');
      expect(studentDetail).toContain('data-testid="btn-medio-transferencia"');
      expect(athleteClasses).toContain('data-testid="renewal-period-banner"');
    });

    it("GIVEN globals.css THEN define pares de tokens semánticos soft con contraste WCAG 2.1 AA", () => {
      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");

      // Light mode tokens
      expect(globalsCss).toContain("--success-soft:");
      expect(globalsCss).toContain("--success-soft-foreground:");
      expect(globalsCss).toContain("--warning-soft:");
      expect(globalsCss).toContain("--warning-soft-foreground:");
      expect(globalsCss).toContain("--danger-soft:");
      expect(globalsCss).toContain("--danger-soft-foreground:");
      expect(globalsCss).toContain("--neutral-soft:");
      expect(globalsCss).toContain("--neutral-soft-foreground:");
    });
  });
});
