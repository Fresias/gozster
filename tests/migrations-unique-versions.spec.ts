import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "..", "supabase", "migrations");

describe("supabase/migrations", () => {
  it("no hay dos migraciones con la misma versión", () => {
    const byVersion = new Map<string, string[]>();
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))) {
      const version = file.split("_")[0] ?? file;
      byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
    }
    const duplicadas = [...byVersion.entries()].filter(([, files]) => files.length > 1);
    expect(duplicadas).toEqual([]);
  });
});
