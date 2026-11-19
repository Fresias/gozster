import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { FONDO_BASE, fondoValue } from "@/lib/athlete/fondo";

// Extrae del HTML de referencia las funciones reales y las evalúa.
function cargarReferencia() {
  const html = fs.readFileSync(
    path.join(process.cwd(), "docs/athlete-v7/referencia/athlete-v7.html"),
    "utf8",
  );
  const ini = html.indexOf("const INT = ");
  const fin = html.indexOf("window.gzFondo = ");
  const bloque = html.slice(ini, fin);
  // bgCells/bgHex usan DOM; solo se invocan para otras claves.
  const fn = new Function(`${bloque}\nreturn { bgValue, INT };`);
  return fn() as {
    bgValue: (...a: unknown[]) => string;
    INT: Record<string, number>;
  };
}

describe("fondo malla asimétrica (FE-12)", () => {
  const ref = cargarReferencia();
  for (const seed of [1, 3, 4242]) {
    for (const dark of [false, true]) {
      it(`coincide con window.gzFondo.bgValue (semilla ${seed}, ${dark ? "oscuro" : "claro"})`, () => {
        const base = dark ? FONDO_BASE.oscuro : FONDO_BASE.claro;
        const esperado = ref.bgValue("malla", dark, ref.INT.sutil, seed, 1, 390, 844, base);
        expect(fondoValue(dark, seed, base)).toBe(esperado);
      });
    }
  }

  it("semillas distintas dan mallas distintas", () => {
    expect(fondoValue(false, 1, "#FAFAFA")).not.toBe(fondoValue(false, 2, "#FAFAFA"));
  });
});
