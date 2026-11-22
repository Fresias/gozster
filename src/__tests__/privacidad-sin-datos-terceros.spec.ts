import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : archivos(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe("Privacidad: sin datos personales de terceros en el código", () => {
  const files = archivos(SRC);

  it("no existen emails @gmail.com en src/ fuera de los tests", () => {
    const hits = files.filter((f) => fs.readFileSync(f, "utf-8").includes("@gmail.com"));
    expect(hits).toEqual([]);
  });

  it("el dataset legado real-mynter-data ya no existe ni se importa", () => {
    expect(fs.existsSync(path.join(SRC, "services/real-mynter-data.ts"))).toBe(false);
    const hits = files.filter((f) => fs.readFileSync(f, "utf-8").includes("real-mynter-data"));
    expect(hits).toEqual([]);
  });
});
