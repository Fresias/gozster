import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { escanearTexto } from "../../scripts/privacy-guard.mjs";

const SRC = path.resolve(__dirname, "..");

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : archivos(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

function archivosTodos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : archivosTodos(p);
    return /\.(ts|tsx|md|html|json|js|mjs|css|sql)$/.test(e.name) ? [p] : [];
  });
}

describe("Privacidad: sin datos personales de terceros en el código", () => {
  const files = archivos(SRC);

  it("no existen emails @gmail.com en src/ fuera de los tests", () => {
    const hits = files.filter((f) => fs.readFileSync(f, "utf-8").includes("@gmail.com"));
    expect(hits).toEqual([]);
  });

  it("src/, tests/ y docs/ no contienen tokens ni UUIDs bloqueados (comparación por hash SHA-256)", () => {
    const raiz = path.resolve(SRC, "..");
    const todos = ["src", "tests", "docs"].flatMap((d) => {
      const dir = path.join(raiz, d);
      return fs.existsSync(dir) ? archivosTodos(dir) : [];
    });
    const hits = todos
      .filter((f) => escanearTexto(fs.readFileSync(f, "utf-8")).some((m) => m !== "email-personal"))
      .map((f) => path.relative(raiz, f));
    expect(hits).toEqual([]);
  });

  it("src/ (producción) no contiene emails @gmail.com ni @hotmail.com", () => {
    const hits = files.filter((f) => /@(gmail|hotmail)\.com/i.test(fs.readFileSync(f, "utf-8")));
    expect(hits).toEqual([]);
  });

  it("critical-alerts-* no tiene overrides por nombre", () => {
    const dir = path.join(SRC, "components/coach");
    for (const f of ["critical-alerts-data.ts", "critical-alerts-store.ts"]) {
      const txt = fs.readFileSync(path.join(dir, f), "utf-8");
      expect(txt).not.toMatch(/isFernando/);
    }
  });

  it("el guard detecta tokens y UUIDs bloqueados sin exponerlos en texto plano", () => {
    expect(escanearTexto("nada que ver aquí")).toEqual([]);
    expect(escanearTexto("contacto: x@gmail.com")).toEqual(["email-personal"]);
  });

  it("el dataset legado real-mynter-data ya no existe ni se importa", () => {
    expect(fs.existsSync(path.join(SRC, "services/real-mynter-data.ts"))).toBe(false);
    const hits = files.filter((f) => fs.readFileSync(f, "utf-8").includes("real-mynter-data"));
    expect(hits).toEqual([]);
  });
});
