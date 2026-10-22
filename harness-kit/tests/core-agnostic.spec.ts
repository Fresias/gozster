import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// D4 — El core del kit debe ser agnóstico del proyecto: `harness-kit/core/**`
// no puede acoplarse a ningún consumidor concreto. Si la palabra "gozster"
// (u otro término prohibido) aparece en el core, este test debe fallar.

const here = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(here, "..", "core");

/** Términos acoplados al proyecto que jamás deben aparecer en el core agnóstico. */
const FORBIDDEN = ["gozster"];

/** Lista recursiva de todos los archivos bajo `dir`. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("core agnóstico (D4): harness-kit/core no conoce al proyecto", () => {
  const files = walk(coreDir);

  it("tiene archivos en el core para auditar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s no contiene términos acoplados al proyecto", (file) => {
    const content = readFileSync(file, "utf8").toLowerCase();
    for (const term of FORBIDDEN) {
      expect(content, `${file} contiene el término prohibido "${term}"`).not.toContain(term);
    }
  });
});
