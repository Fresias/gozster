import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const view = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
  "utf-8",
);

describe("GOZS-130: email fuera de las filas en Modo Testeo", () => {
  it("la fila solo renderiza el email fuera de Testeo", () => {
    expect(view).toMatch(/\{!isTestMode && \(\s*<span[^>]*>\s*\{alumno\.email \?\? "—"\}/);
  });

  it("el placeholder cambia solo en Testeo y el buscador sigue filtrando por email", () => {
    expect(view).toContain(
      'placeholder={isTestMode ? "Buscar atleta…" : "Buscar atleta o email..."}',
    );
    expect(view).toContain("a.email?.toLowerCase().includes(filterQuery.toLowerCase())");
  });
});
