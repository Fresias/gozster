import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const view = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
  "utf-8",
);

describe("GOZS-130: email fuera de las filas", () => {
  it("la fila no renderiza el email", () => {
    expect(view).not.toMatch(/\{alumno\.email \?\? "—"\}/);
  });

  it("el placeholder es 'Buscar alumno' (09 P08) y el buscador sigue filtrando por email", () => {
    expect(view).toContain('placeholder="Buscar alumno"');
    expect(view).toContain("a.email?.toLowerCase().includes(filterQuery.toLowerCase())");
  });
});
