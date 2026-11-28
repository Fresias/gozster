import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ejecutarCheckMigraciones,
  evaluarParidadMigraciones,
  formatearReporteError,
  listarVersionesLocales,
  parsearSalidaMigrationList,
  X1_MIGRATION_VERSION,
} from "../../scripts/check-supabase-migrations.mjs";
import {
  compararTiposGenerados,
  ejecutarCheckTipos,
  formatearReporteErrorTipos,
  normalizarContenidoTipos,
} from "../../scripts/check-supabase-types.mjs";

// GOZS-928: contrato de los gates CI de migraciones (G6) y tipos generados, en directorios temporales aislados.

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gozs-928-gates-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function crearMigraciones(versiones: string[]): string {
  const dir = path.join(tmp, "migrations");
  fs.mkdirSync(dir, { recursive: true });
  for (const v of versiones) fs.writeFileSync(path.join(dir, `${v}_demo.sql`), "SELECT 1;\n");
  fs.writeFileSync(path.join(dir, "README.md"), "no es sql");
  return dir;
}

const listaJson = (filas: Array<{ local?: string; remote?: string }>) => JSON.stringify(filas);

describe("check-supabase-migrations", () => {
  it("listarVersionesLocales ordena y solo toma .sql; falla si el directorio no existe", () => {
    const dir = crearMigraciones(["20261002000000", "20261001000000"]);
    expect(listarVersionesLocales(dir)).toEqual([
      { version: "20261001000000", file: "20261001000000_demo.sql" },
      { version: "20261002000000", file: "20261002000000_demo.sql" },
    ]);
    expect(() => listarVersionesLocales(path.join(tmp, "no-existe"))).toThrow(/No existe el directorio/);
  });

  it("parsearSalidaMigrationList acepta array JSON, envoltorio CLI, NDJSON y tabla; falla cerrado si está vacía o es ilegible", () => {
    const esperado = [{ local: "20261001000000", remote: "20261001000000" }];
    expect(parsearSalidaMigrationList(listaJson(esperado))).toEqual(esperado);
    expect(parsearSalidaMigrationList(JSON.stringify({ migrations: esperado }))).toEqual(esperado);
    expect(parsearSalidaMigrationList(JSON.stringify({ data: { migrations: esperado } }))).toEqual(esperado);
    expect(parsearSalidaMigrationList(`${JSON.stringify(esperado[0])}\n${JSON.stringify(esperado[0])}`)).toHaveLength(2);
    const tabla = "Local | Remote | Time (UTC)\n---|---|---\n20261001000000 | 20261001000000 | 2026-10-01\n20261002000000 | | ";
    expect(parsearSalidaMigrationList(tabla)).toEqual([
      { local: "20261001000000", remote: "20261001000000" },
      { local: "20261002000000", remote: "" },
    ]);
    expect(() => parsearSalidaMigrationList("")).toThrow(/vacía/);
    expect(() => parsearSalidaMigrationList("sin tabla ninguna")).toThrow(/No se pudieron interpretar/);
  });

  it("evaluarParidadMigraciones detecta pendientes locales y remotas sin archivo local", () => {
    const locales = [
      { version: "1", file: "1_a.sql" },
      { version: "2", file: "2_b.sql" },
    ];
    const ok = evaluarParidadMigraciones({ locales, registrosRemotos: [{ remote: "1" }, { remote: "2" }] });
    expect(ok).toMatchObject({ ok: true, pendientes: [], soloRemotas: [], aplicadas: 2, totalLocales: 2 });
    const mal = evaluarParidadMigraciones({ locales, registrosRemotos: [{ remote: "1" }, { remote: "9" }] });
    expect(mal.ok).toBe(false);
    expect(mal.pendientes.map((m: { version: string }) => m.version)).toEqual(["2"]);
    expect(mal.soloRemotas).toEqual(["9"]);
    expect(mal.aplicadas).toBe(1);
  });

  it("formatearReporteError lista pendientes y agrega la nota X1 solo si corresponde", () => {
    const base = {
      pendientes: [{ version: "20261002000000", file: "20261002000000_demo.sql" }],
      aplicadas: 1,
      totalLocales: 2,
    };
    const rep = formatearReporteError(base);
    expect(rep).toContain("DEPLOY BLOQUEADO");
    expect(rep).toContain("20261002000000_demo.sql");
    expect(rep).not.toContain("Nota X1");
    const repX1 = formatearReporteError({
      ...base,
      pendientes: [{ version: X1_MIGRATION_VERSION, file: `${X1_MIGRATION_VERSION}_x.sql` }],
    });
    expect(repX1).toContain("Nota X1");
  });

  describe("ejecutarCheckMigraciones", () => {
    it("OK cuando todo está aplicado", () => {
      const dir = crearMigraciones(["20261001000000", "20261002000000"]);
      const salida = listaJson([{ remote: "20261001000000" }, { remote: "20261002000000" }]);
      const { resultado } = ejecutarCheckMigraciones(["--migrations-dir", dir], { obtenerSalida: () => salida });
      expect(resultado.ok).toBe(true);
    });

    it("migración local pendiente → ok=false", () => {
      const dir = crearMigraciones(["20261001000000", "20261002000000"]);
      const { resultado } = ejecutarCheckMigraciones(["--migrations-dir", dir], {
        obtenerSalida: () => listaJson([{ remote: "20261001000000" }]),
      });
      expect(resultado.ok).toBe(false);
      expect(resultado.pendientes).toHaveLength(1);
    });

    it("remota sin local → ok pero informada en soloRemotas", () => {
      const dir = crearMigraciones(["20261001000000"]);
      const { resultado } = ejecutarCheckMigraciones(["--migrations-dir", dir], {
        obtenerSalida: () => listaJson([{ remote: "20261001000000" }, { remote: "20269999000000" }]),
      });
      expect(resultado.ok).toBe(true);
      expect(resultado.soloRemotas).toEqual(["20269999000000"]);
    });

    it("lee --input-file en lugar de invocar la CLI", () => {
      const dir = crearMigraciones(["20261001000000"]);
      const archivo = path.join(tmp, "list.json");
      fs.writeFileSync(archivo, listaJson([{ remote: "20261001000000" }]));
      const { resultado } = ejecutarCheckMigraciones(["--migrations-dir", dir, "--input-file", archivo], {
        obtenerSalida: () => {
          throw new Error("no debe invocarse la CLI");
        },
      });
      expect(resultado.ok).toBe(true);
    });

    it("propaga el error de la CLI, directorio sin migraciones y salida vacía", () => {
      const dir = crearMigraciones(["20261001000000"]);
      expect(() =>
        ejecutarCheckMigraciones(["--migrations-dir", dir], {
          obtenerSalida: () => {
            throw new Error("supabase: not logged in");
          },
        }),
      ).toThrow(/not logged in/);
      expect(() => ejecutarCheckMigraciones(["--migrations-dir", dir], { obtenerSalida: () => "" })).toThrow(/vacía/);
      const vacio = path.join(tmp, "vacio");
      fs.mkdirSync(vacio);
      expect(() => ejecutarCheckMigraciones(["--migrations-dir", vacio], { obtenerSalida: () => "[]" })).toThrow(
        /No se encontraron migraciones/,
      );
    });
  });
});

const TIPOS = "export type Database = {\n  public: { Tables: {} }\n}\n";

describe("check-supabase-types", () => {
  it("normalizarContenidoTipos unifica CRLF/LF y recorta espacios finales del archivo", () => {
    expect(normalizarContenidoTipos("a\r\nb\r\n\r\n")).toBe("a\nb\n");
    expect(normalizarContenidoTipos("   ")).toBe("");
    expect(normalizarContenidoTipos(undefined)).toBe("");
  });

  it("compararTiposGenerados: idénticos con distinto CRLF/LF → ok", () => {
    const r = compararTiposGenerados({ versionado: TIPOS.replace(/\n/g, "\r\n"), generado: TIPOS });
    expect(r.ok).toBe(true);
    expect(r.diferencias).toEqual([]);
  });

  it("compararTiposGenerados: drift real → líneas distintas y reporte con regeneración", () => {
    const generado = TIPOS.replace("Tables: {}", "Tables: { x: {} }");
    const r = compararTiposGenerados({ versionado: TIPOS, generado });
    expect(r.ok).toBe(false);
    expect(r.diferencias).toEqual([
      { linea: 2, versionado: "  public: { Tables: {} }", generado: "  public: { Tables: { x: {} } }" },
    ]);
    const rep = formatearReporteErrorTipos(r, path.join(tmp, "database.types.ts"));
    expect(rep).toContain("TYPES DESINCRONIZADOS");
    expect(rep).toContain("database.types.ts");
    expect(rep).toContain("gen types typescript");
  });

  it("compararTiposGenerados: salida vacía o sin `Database` → error", () => {
    expect(() => compararTiposGenerados({ versionado: TIPOS, generado: "" })).toThrow(/vacía/);
    expect(() => compararTiposGenerados({ versionado: TIPOS, generado: "export type Otro = {}\n" })).toThrow(
      /no contiene el tipo `Database`/,
    );
  });

  it("formatearReporteErrorTipos trunca a 25 diferencias", () => {
    const versionado = `export type Database = {}\n${Array.from({ length: 40 }, (_, i) => `a${i}`).join("\n")}\n`;
    const generado = `export type Database = {}\n${Array.from({ length: 40 }, (_, i) => `b${i}`).join("\n")}\n`;
    const r = compararTiposGenerados({ versionado, generado });
    expect(r.diferencias).toHaveLength(40);
    expect(formatearReporteErrorTipos(r)).toContain("15 diferencia(s) adicionales");
  });

  describe("ejecutarCheckTipos", () => {
    it("ok con distinto fin de línea y con --input-file", () => {
      const tipos = path.join(tmp, "database.types.ts");
      fs.writeFileSync(tipos, TIPOS.replace(/\n/g, "\r\n"));
      const { resultado } = ejecutarCheckTipos(["--types-file", tipos], { obtenerSalida: () => TIPOS });
      expect(resultado.ok).toBe(true);
      const entrada = path.join(tmp, "gen.ts");
      fs.writeFileSync(entrada, TIPOS);
      const r2 = ejecutarCheckTipos(["--types-file", tipos, "--input-file", entrada], {
        obtenerSalida: () => {
          throw new Error("no debe invocarse la CLI");
        },
      });
      expect(r2.resultado.ok).toBe(true);
    });

    it("drift real → ok=false; salida sin Database → error; archivo versionado inexistente → error", () => {
      const tipos = path.join(tmp, "database.types.ts");
      fs.writeFileSync(tipos, TIPOS);
      const drift = ejecutarCheckTipos(["--types-file", tipos], {
        obtenerSalida: () => TIPOS.replace("Tables: {}", "Tables: { y: {} }"),
      });
      expect(drift.resultado.ok).toBe(false);
      expect(() => ejecutarCheckTipos(["--types-file", tipos], { obtenerSalida: () => "basura" })).toThrow(
        /no contiene el tipo `Database`/,
      );
      expect(() =>
        ejecutarCheckTipos(["--types-file", path.join(tmp, "nope.ts")], { obtenerSalida: () => TIPOS }),
      ).toThrow(/No existe el archivo de tipos/);
    });
  });
});
