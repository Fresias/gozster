import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const view = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
  "utf-8",
);

describe("GOZS-129: densidad fija en 48 px en Modo Testeo", () => {
  it("el selector de densidad solo se renderiza fuera de Testeo", () => {
    expect(view).toContain("{!isTestMode && (<div");
    expect(view).toContain("Compacto (34px)");
  });

  it("la fila es compacta solo en Producción y conserva el estado inicial", () => {
    expect(view).toContain('const isCompact = !isTestMode && tableDensity === "compact";');
    expect(view).toContain('React.useState<"compact" | "standard">("compact")');
    expect(view).toContain('"min-h-[48px] py-2.5"');
  });
});
