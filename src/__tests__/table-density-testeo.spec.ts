import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const view = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
  "utf-8",
);

describe("GOZS-129: densidad fija en 48 px", () => {
  it("no hay selector de densidad", () => {
    expect(view).not.toContain("Compacto (34px)");
    expect(view).not.toContain("tableDensity");
  });

  it("la fila usa siempre la altura táctil de 48 px", () => {
    expect(view).toContain('const rowPaddingClass = "min-h-[48px] py-2.5";');
  });
});
