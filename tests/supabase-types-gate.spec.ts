import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  compararTiposGenerados,
  ejecutarCheckTipos,
  formatearReporteErrorTipos,
} from "../scripts/check-supabase-types.mjs";
import type { Database as GeneratedDatabase } from "../types/database.types";
import type { Database as AppDatabase } from "@/types/database.types";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const checkScriptPath = path.join(repoRoot, "scripts", "check-supabase-types.mjs");
const versionedTypesPath = path.join(repoRoot, "types", "database.types.ts");

describe("GOZS-698 (E-5): Tipos de base de datos generados y comparados en CI", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  describe("AC 1: types/database.types.ts generado con supabase gen types y diff vacío", () => {
    it("GIVEN el archivo versionado types/database.types.ts WHEN se compara contra la salida de supabase gen types THEN el diff es vacío (exit 0)", () => {
      const stdout = execFileSync(
        process.execPath,
        [checkScriptPath, "--input-file", versionedTypesPath],
        {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "pipe",
        }
      );

      expect(stdout).toContain("OK: database.types.ts");
      expect(stdout).toContain("coincide sin diferencias");
    });

    it("normaliza CRLF vs LF sin falsos positivos", () => {
      const versionado = readFileSync(versionedTypesPath, "utf8");
      const generadoConCrlf = versionado.replace(/\r?\n/g, "\r\n");

      const resultado = compararTiposGenerados({
        versionado,
        generado: generadoConCrlf,
      });

      expect(resultado.ok).toBe(true);
      expect(resultado.diferencias).toHaveLength(0);
    });

    it("incluye las 4 funciones que faltaban (registrar_molestia, actualizar_nombre_preferido y helpers) y omite las 10 RPCs podadas", () => {
      const content = readFileSync(versionedTypesPath, "utf8");

      expect(content).toContain('"registrar_molestia":');
      expect(content).toContain('"actualizar_nombre_preferido":');
      expect(content).toContain('"_resolver_cobertura_actividad_alumno":');
      expect(content).toContain('"fn_estado_contratacion_por_fecha":');

      expect(content).not.toContain('"activar_rutina":');
      expect(content).not.toContain('"anotar_alumno":');
      expect(content).not.toContain('"obtener_ficha_alumno_actividades":');

      // Verificación estática en tiempo de compilación sobre GeneratedDatabase y AppDatabase
      type GenFns = GeneratedDatabase["public"]["Functions"];
      type AppFns = AppDatabase["public"]["Functions"];
      const checkSignatures: [
        keyof GenFns & "registrar_molestia",
        keyof GenFns & "actualizar_nombre_preferido",
        keyof GenFns & "_resolver_cobertura_actividad_alumno",
        keyof GenFns & "fn_estado_contratacion_por_fecha",
        keyof AppFns & "registrar_molestia",
        keyof AppFns & "actualizar_nombre_preferido",
      ] = [
        "registrar_molestia",
        "actualizar_nombre_preferido",
        "_resolver_cobertura_actividad_alumno",
        "fn_estado_contratacion_por_fecha",
        "registrar_molestia",
        "actualizar_nombre_preferido",
      ];
      expect(checkSignatures).toHaveLength(6);
    });
  });

  describe("AC 2: migración nueva sin tipos regenerados falla el check de CI", () => {
    it("GIVEN una migración nueva sin regenerar types/database.types.ts WHEN corre el check THEN falla con código 1 e informa la diferencia", () => {
      const versionado = readFileSync(versionedTypesPath, "utf8");
      const generadoConNuevaFuncion = versionado.replace(
        '          Enums: {',
        '            "nueva_rpc_sin_regenerar": { Args: Record<PropertyKey, never>; Returns: boolean },\n          Enums: {'
      );
      expect(generadoConNuevaFuncion).not.toBe(versionado);

      const dir = mkdtempSync(path.join(tmpdir(), "gozs-types-drift-"));
      tempDirs.push(dir);
      const generatedFile = path.join(dir, "generated.types.ts");
      writeFileSync(generatedFile, generadoConNuevaFuncion, "utf8");

      let exitCode = 0;
      let stderr = "";
      try {
        execFileSync(
          process.execPath,
          [checkScriptPath, "--input-file", generatedFile],
          {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: "pipe",
          }
        );
      } catch (err: unknown) {
        const execErr = err as { status?: number; stderr?: string };
        exitCode = execErr.status ?? 1;
        stderr = execErr.stderr ?? "";
      }

      expect(exitCode).toBe(1);
      expect(stderr).toContain("TYPES DESINCRONIZADOS");
      expect(stderr).toContain("nueva_rpc_sin_regenerar");
      expect(stderr).toContain("supabase gen types");
    });

    it("falla cerrado si la salida de supabase gen types está vacía o es inválida", () => {
      expect(() =>
        ejecutarCheckTipos([], {
          obtenerSalida: () => "   ",
        })
      ).toThrow(/vacía/);

      expect(() =>
        ejecutarCheckTipos([], {
          obtenerSalida: () => "error connecting to database",
        })
      ).toThrow(/Database/);

      const resultado = compararTiposGenerados({
        versionado: "export type Database = { public: {} }",
        generado: "export type Database = { public: { Tables: {} } }",
      });
      expect(resultado.ok).toBe(false);
      expect(formatearReporteErrorTipos(resultado)).toContain("TYPES DESINCRONIZADOS");
    });
  });
});
