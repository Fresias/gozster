import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const view = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
  "utf-8",
);

describe("GOZS-131: tabla de alumnos colapsable y colapsada", () => {
  it("el estado arranca colapsado", () => {
    expect(view).toContain("const [isAlumnosExpanded, setIsAlumnosExpanded] = React.useState(false);");
  });

  it("el cuerpo depende del toggle", () => {
    expect(view).toContain("const showAlumnosBody = isAlumnosExpanded;");
    expect(view).toContain("{showAlumnosBody && (<>");
  });

  it("el header colapsable existe, con contador del total y aria-expanded", () => {
    expect(view).toMatch(/<button[^>]*onClick=\{\(\) => setIsAlumnosExpanded/);
    expect(view).toContain("aria-expanded={isAlumnosExpanded}");
    expect(view).toContain("w-full min-h-14 px-5 flex items-center justify-between");
    expect(view).toContain("rounded-full bg-secondary px-2 text-xs tabular-nums");
    expect(view).toMatch(/tabular-nums">\s*\{alumnos\.length\}/);
  });

  it("la card envolvente aplica siempre", () => {
    expect(view).toContain(
      'className="rounded-2xl border border-border bg-card space-y-4 pb-4 [&>:not(button)]:mx-5"',
    );
  });

  it("el título interno 'Alumnos' del cuadro no se duplica", () => {
    expect(view).not.toContain('"Alumnos" : "Cuadro 1.1"');
    expect(view).not.toContain("Cuadro 1.1</span>");
  });
});
