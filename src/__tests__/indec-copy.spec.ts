import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-128: sin la palabra INDEC en el copy del Coach Studio", () => {
  const view = read("../components/coach/coach-studio-view.tsx");

  it("título del cuadro y footer no dicen INDEC ni nombran un modo", () => {
    expect(view).not.toContain("Cuadro 1.1</span>");
    expect(view).toContain("Fuente: GOZSter Studio / Dataset demo");
    expect(view).not.toContain("MODO TESTEO");
    expect(view).not.toContain("Demostración Conceptual INDEC");
    expect(view).not.toContain("Dataset Demo INDEC");
  });

  it("el roster de la home dice 'Roster de atletas'", () => {
    const pill = read("../components/roster-pill-label.tsx");
    expect(pill).toContain("Roster de atletas");
    expect(pill).not.toContain("INDEC");
  });
});
