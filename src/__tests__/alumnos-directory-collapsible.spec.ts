import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const view = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
  "utf-8",
);

describe("GOZS-131: tabla de alumnos colapsable y colapsada en Modo Testeo", () => {
  it("el estado arranca colapsado y vuelve a colapsado al cambiar de modo", () => {
    expect(view).toContain("const [isAlumnosExpanded, setIsAlumnosExpanded] = React.useState(false);");
    expect(view).toMatch(
      /React\.useEffect\(\(\) => \{\s*setIsAlumnosExpanded\(false\);\s*\}, \[isTestMode\]\);/,
    );
  });

  it("Producción siempre muestra el cuerpo; Testeo depende del toggle", () => {
    expect(view).toContain("const showAlumnosBody = !isTestMode || isAlumnosExpanded;");
    expect(view).toContain("{showAlumnosBody && (<>");
  });

  it("el header colapsable existe solo en Testeo, con contador del total y aria-expanded", () => {
    expect(view).toMatch(/\{isTestMode && \(\s*<button[^>]*onClick=\{\(\) => setIsAlumnosExpanded/);
    expect(view).toContain("aria-expanded={isAlumnosExpanded}");
    expect(view).toContain("w-full min-h-14 px-5 flex items-center justify-between");
    expect(view).toContain("rounded-full bg-secondary px-2 text-xs tabular-nums");
    expect(view).toMatch(/tabular-nums">\s*\{alumnos\.length\}/);
  });

  it("la card envolvente aplica solo en Testeo y Producción conserva space-y-4", () => {
    expect(view).toContain('? "rounded-2xl border border-border bg-card space-y-4 pb-4 [&>:not(button)]:mx-5"');
    expect(view).toContain(': "space-y-4"');
  });

  it("el título interno 'Alumnos' del cuadro ya no se duplica en Testeo", () => {
    expect(view).not.toContain('isTestMode ? "Alumnos" : "Cuadro 1.1"');
    expect(view).toMatch(/\{!isTestMode && \(\s*<span[^>]*>Cuadro 1\.1<\/span>/);
  });
});
