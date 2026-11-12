import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

describe("GOZS-504: Deuda visual en student-detail.tsx y sus islas (texto < 12px y colores hardcodeados)", () => {
  const baseDir = path.resolve(__dirname, "../components/coach");
  const mainFile = path.join(baseDir, "student-detail.tsx");
  const islasDir = path.join(baseDir, "student-detail/islas");

  const filesToCheck = [
    mainFile,
    ...fs
      .readdirSync(islasDir)
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => path.join(islasDir, file)),
  ];

  it("GIVEN student-detail.tsx y sus islas THEN no contienen clases de texto menor a 12px (text-[8px] a text-[11px])", () => {
    const smallTextRegex = /text-\[(8|9|10|11)px\]/g;
    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of filesToCheck) {
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
      `Se encontraron clases con texto menor a 12px:\n${JSON.stringify(violations, null, 2)}`
    ).toHaveLength(0);
  });

  it("GIVEN student-detail.tsx y sus islas THEN no contienen colores hardcodeados de paleta ni hex", () => {
    const hardcodedColorRegex =
      /#[0-9a-fA-F]{6}\b|rgba?\(|\b(bg|text|border|ring|fill|stroke|from|to|via)-(red|blue|green|emerald|amber|yellow|orange|sky|cyan|slate|zinc|gray|neutral|rose|indigo|violet|purple|teal|lime|pink)-\d{2,3}/g;
    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        const matches = lineText.match(hardcodedColorRegex);
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
      `Se encontraron colores hardcodeados:\n${JSON.stringify(violations, null, 2)}`
    ).toHaveLength(0);
  });

  it("GIVEN student-detail.tsx THEN utiliza tokens semánticos (success-soft, warning-soft, danger-soft, neutral-soft)", () => {
    const content = fs.readFileSync(mainFile, "utf-8");
    expect(content).toContain("bg-success-soft");
    expect(content).toContain("bg-warning-soft");
    expect(content).toContain("bg-danger-soft");
    expect(content).toContain("text-success-soft-foreground");
    expect(content).toContain("text-warning-soft-foreground");
    expect(content).toContain("text-danger-soft-foreground");
    expect(content).toContain("border-neutral-soft-border");
  });
});
