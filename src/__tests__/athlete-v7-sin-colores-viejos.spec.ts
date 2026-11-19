import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const TARGET_DIRS = ["src/components/athlete", "src/app/(athlete)"] as const;
const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".css"]);

const OLD_TAILWIND_COLOR_RE =
  /\b(bg|text|border|from|to|ring)-(blue|sky|cyan|violet|purple|amber|yellow|orange|green|emerald|lime)-/;
const FORBIDDEN_LITERALS: Array<{ label: string; re: RegExp }> = [
  { label: "#2563EB", re: /#2563eb/i },
  { label: "#0EA5E9", re: /#0ea5e9/i },
  { label: "Modo Avión", re: /Modo Avión/ },
  { label: "🎬", re: /🎬/ },
  { label: "🏆", re: /🏆/ },
];

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (st.isFile()) {
      const dot = entry.lastIndexOf(".");
      const ext = dot >= 0 ? entry.slice(dot) : "";
      if (ALLOWED_EXTENSIONS.has(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

describe("Athlete v7 · QA-03 CP1: Sin restos del tema anterior (05-qa.md §3.4)", () => {
  const files = TARGET_DIRS.flatMap((dir) => walkFiles(resolve(ROOT, dir)));

  it("encuentra archivos del alumno para auditar", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("ningún archivo de src/components/athlete/** o src/app/(athlete)/** contiene #2563EB, #0EA5E9, 'Modo Avión', 🎬 ni 🏆", () => {
    const violations: Array<{ file: string; line: number; token: string; text: string }> = [];

    for (const filePath of files) {
      const relPath = relative(ROOT, filePath).replace(/\\/g, "/");
      const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
      lines.forEach((lineText, idx) => {
        for (const { label, re } of FORBIDDEN_LITERALS) {
          if (re.test(lineText)) {
            violations.push({
              file: relPath,
              line: idx + 1,
              token: label,
              text: lineText.trim(),
            });
          }
        }
      });
    }

    expect(violations, `Restos prohibidos encontrados:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
  });

  it("ningún componente activo del alumno usa clases Tailwind de colores viejos (blue/sky/cyan/violet/purple/amber/yellow/orange/green/emerald/lime)", () => {
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const filePath of files) {
      const relPath = relative(ROOT, filePath).replace(/\\/g, "/");
      const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

      lines.forEach((lineText, idx) => {
        if (!OLD_TAILWIND_COLOR_RE.test(lineText)) return;

        // Excepción documentada en qa-athlete-resto-visual-debt-tokens.spec.tsx y 04-frontend.md:51:
        // plate-calculator-modal.tsx quedó fuera de uso en v7 (D-21) y sus líneas 48-67 son colores estándar IPF.
        if (relPath === "src/components/athlete/plate-calculator-modal.tsx" && idx + 1 >= 48 && idx + 1 <= 67) {
          return;
        }

        violations.push({
          file: relPath,
          line: idx + 1,
          text: lineText.trim(),
        });
      });
    }

    expect(
      violations,
      `Clases Tailwind del tema anterior encontradas:\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  it("plate-calculator-modal.tsx no está importado ni montado en la app del alumno (D-21)", () => {
    const importers: string[] = [];
    for (const filePath of files) {
      const relPath = relative(ROOT, filePath).replace(/\\/g, "/");
      if (relPath === "src/components/athlete/plate-calculator-modal.tsx") continue;
      const src = readFileSync(filePath, "utf8");
      if (src.includes("plate-calculator-modal") || src.includes("PlateCalculatorModal")) {
        importers.push(relPath);
      }
    }
    expect(importers).toEqual([]);
  });
});
