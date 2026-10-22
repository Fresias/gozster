import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-128: sin la palabra INDEC en Modo Testeo", () => {
  const view = read("../components/coach/coach-studio-view.tsx");

  it("banner, título del cuadro y footer no dicen INDEC en Testeo", () => {
    expect(view).toContain("MODO TESTEO ACTIVO</span>");
    expect(view).toContain('<span className="text-xs font-black text-foreground">Cuadro 1.1</span>');
    expect(view).toContain("Modo Testeo (Dataset demo)");
    expect(view).not.toContain("Demostración Conceptual INDEC");
    expect(view).not.toContain("Dataset Demo INDEC");
  });

  it("el roster de la home alterna por modo y Producción conserva el texto original", () => {
    const pill = read("../components/roster-pill-label.tsx");
    expect(pill).toContain('mode === "TESTEO" ? "Roster de atletas" : "Roster de Atletas INDEC"');
  });
});
