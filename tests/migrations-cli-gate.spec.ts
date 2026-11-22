import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ejecutarCheckMigraciones,
  evaluarParidadMigraciones,
  formatearReporteError,
  listarVersionesLocales,
  parsearSalidaMigrationList,
  X1_MIGRATION_VERSION,
} from "../scripts/check-supabase-migrations.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const checkScriptPath = path.join(repoRoot, "scripts", "check-supabase-migrations.mjs");

describe("GOZS-688 (E-3/E-4): Supabase CLI config, check de migraciones y documentación", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  describe("AC 1: supabase/config.toml versionado", () => {
    it("GIVEN el repo WHEN existe supabase init THEN supabase/config.toml y supabase/.gitignore están presentes y sin secretos", () => {
      const configPath = path.join(repoRoot, "supabase", "config.toml");
      const gitignorePath = path.join(repoRoot, "supabase", ".gitignore");

      expect(existsSync(configPath)).toBe(true);
      expect(existsSync(gitignorePath)).toBe(true);

      const content = readFileSync(configPath, "utf8");
      expect(content).toContain('project_id = "gozster"');
      expect(content).toMatch(/\[db\.migrations\][\s\S]*enabled\s*=\s*true/);
      expect(content).toMatch(/\[db\.seed\][\s\S]*sql_paths\s*=\s*\["\.\/seed\.sql"\]/);
      expect(content).not.toMatch(/sbp_[a-zA-Z0-9]{10,}/);
    });
  });

  describe("AC 2: scripts/check-supabase-migrations.mjs (gate de paridad)", () => {
    it("interpreta el payload envolvente de Supabase CLI v3 (migrations / data.migrations) y tabla con backticks", () => {
      const sincronizado = parsearSalidaMigrationList(
        JSON.stringify({
          migrations: [{ local: "20261016000000", remote: "20261016000000", time: "2026-10-16 00:00:00" }],
          message: "Migrations listed",
          target: { type: "remote" },
        })
      );
      expect(sincronizado).toEqual([{ local: "20261016000000", remote: "20261016000000" }]);

      const pendiente = parsearSalidaMigrationList(
        JSON.stringify({
          migrations: [
            { local: "20261016000000", remote: "20261016000000" },
            { local: "20261121223500", remote: "" },
          ],
          message: "Migrations listed",
          target: {},
        })
      );
      expect(pendiente).toEqual([
        { local: "20261016000000", remote: "20261016000000" },
        { local: "20261121223500", remote: "" },
      ]);

      const stream = parsearSalidaMigrationList(
        JSON.stringify({ data: { migrations: [{ local: "20261016000000", remote: "" }] } })
      );
      expect(stream).toEqual([{ local: "20261016000000", remote: "" }]);

      const conBackticks = parsearSalidaMigrationList(
        ["| `20261016000000` | `20261016000000` | 2026-10-16 00:00:00", "| `20261121223500` | | 2026-11-21"].join("\n")
      );
      expect(conBackticks).toEqual([
        { local: "20261016000000", remote: "20261016000000" },
        { local: "20261121223500", remote: "" },
      ]);
    });

    it("interpreta salida JSON (array y NDJSON) y tabular de supabase migration list", () => {
      const desdeArray = parsearSalidaMigrationList(
        JSON.stringify([
          { local: "20261016000000", remote: "20261016000000" },
          { local: "20261016100000", remote: "" },
        ])
      );
      expect(desdeArray).toEqual([
        { local: "20261016000000", remote: "20261016000000" },
        { local: "20261016100000", remote: "" },
      ]);

      const desdeNdjson = parsearSalidaMigrationList(
        [
          '{"Local":"20261016000000","Remote":"20261016000000"}',
          '{"Local":"20261121223500","Remote":""}',
        ].join("\n")
      );
      expect(desdeNdjson).toEqual([
        { local: "20261016000000", remote: "20261016000000" },
        { local: "20261121223500", remote: "" },
      ]);

      const desdeTabla = parsearSalidaMigrationList(
        [
          "   Local          | Remote         | Time (UTC)",
          "  ----------------|----------------|---------------------",
          "   20261016000000 | 20261016000000 | 2026-10-16 00:00:00",
          "   20261121223500 |                | 2026-11-21 22:35:00",
        ].join("\n")
      );
      expect(desdeTabla).toEqual([
        { local: "20261016000000", remote: "20261016000000" },
        { local: "20261121223500", remote: "" },
      ]);
    });

    it("GIVEN todas las migraciones del repo aplicadas en destino WHEN corre el check THEN sale con 0", () => {
      const locales = listarVersionesLocales();
      expect(locales.length).toBeGreaterThan(0);

      const dir = mkdtempSync(path.join(tmpdir(), "gozs-mig-ok-"));
      tempDirs.push(dir);
      const inputFile = path.join(dir, "list.json");
      writeFileSync(
        inputFile,
        JSON.stringify(locales.map((m) => ({ local: m.version, remote: m.version }))),
        "utf8"
      );

      const stdout = execFileSync(process.execPath, [checkScriptPath, "--input-file", inputFile], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: "pipe",
      });

      expect(stdout).toContain(`OK: ${locales.length}/${locales.length}`);
    });

    it("GIVEN migraciones del repo sin aplicar en destino WHEN corre el check THEN falla con código 1 y lista las pendientes", () => {
      const locales = listarVersionesLocales();
      const faltante = locales.at(-1);
      if (!faltante) throw new Error("Se esperaba al menos una migración local");

      const dir = mkdtempSync(path.join(tmpdir(), "gozs-mig-fail-"));
      tempDirs.push(dir);
      const inputFile = path.join(dir, "list.json");
      writeFileSync(
        inputFile,
        JSON.stringify(
          locales.map((m) => ({
            local: m.version,
            remote: m.version === faltante.version ? "" : m.version,
          }))
        ),
        "utf8"
      );

      let exitCode = 0;
      let stderr = "";
      try {
        execFileSync(process.execPath, [checkScriptPath, "--input-file", inputFile], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (err: unknown) {
        const execErr = err as { status?: number; stderr?: string };
        exitCode = execErr.status ?? 1;
        stderr = execErr.stderr ?? "";
      }

      expect(exitCode).toBe(1);
      expect(stderr).toContain("DEPLOY BLOQUEADO");
      expect(stderr).toContain(faltante.file);
      expect(stderr).toContain("supabase db push --remote");
    });

    it("incluye la guía X1 cuando 20261016100000 está pendiente y falla cerrado ante salida vacía", () => {
      const locales = [
        { version: "20261016000000", file: "20261016000000_initial_schema_rls.sql" },
        {
          version: X1_MIGRATION_VERSION,
          file: "20261016100000_multicoach_subscription_cloning.sql",
        },
      ];
      const resultado = evaluarParidadMigraciones({
        locales,
        registrosRemotos: [{ local: "20261016000000", remote: "20261016000000" }],
      });

      expect(resultado.ok).toBe(false);
      expect(resultado.pendientes).toHaveLength(1);
      const msg = formatearReporteError(resultado);
      expect(msg).toContain("Nota X1");
      expect(msg).toContain("ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS");

      expect(() =>
        ejecutarCheckMigraciones([], {
          obtenerSalida: () => "   ",
        })
      ).toThrow(/vacía/);
    });
  });

  describe("AC 3: Documentación unificada (solo supabase db push o job de CI)", () => {
    it("README.md y docs/architecture/migraciones-supabase.md documentan supabase db push y runbook X1", () => {
      const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
      const docPath = path.join(repoRoot, "docs", "architecture", "migraciones-supabase.md");
      expect(existsSync(docPath)).toBe(true);

      const doc = readFileSync(docPath, "utf8");
      expect(readme).toContain("supabase db push");
      expect(readme).toContain("docs/architecture/migraciones-supabase.md");
      expect(doc).toContain("supabase db push");
      expect(doc).toContain("Prohibido");
      expect(doc).toContain("20261016100000");
      expect(doc).toContain("ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS");
    });
  });
});
