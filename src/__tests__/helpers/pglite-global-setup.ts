import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TestProject } from "vitest/node";
import {
  construirDbMigradaDesdeCero,
  rutaSnapshotParaHash,
} from "./pglite-migrada";

const PREFIX = "gozster-pglite-";
const STALE_MS = 60 * 60 * 1000;

function limpiarSnapshotsAntiguos(rutaActual: string): void {
  const dir = os.tmpdir();
  const actual = path.basename(rutaActual);
  const ahora = Date.now();
  try {
    for (const nombre of fs.readdirSync(dir)) {
      if (!nombre.startsWith(PREFIX) || !nombre.endsWith(".tar") || nombre === actual) continue;
      const ruta = path.join(dir, nombre);
      try {
        const stat = fs.statSync(ruta);
        if (ahora - stat.mtimeMs > STALE_MS) fs.unlinkSync(ruta);
      } catch {
        // Ignorar archivos en uso por otro proceso en paralelo
      }
    }
  } catch {
    // Ignorar errores de lectura de tmpdir
  }
}

export async function setup(project: TestProject): Promise<void> {
  const rutaSnapshot = rutaSnapshotParaHash();

  if (!fs.existsSync(rutaSnapshot) || fs.statSync(rutaSnapshot).size === 0) {
    const db = await construirDbMigradaDesdeCero();
    try {
      const blob = await db.dumpDataDir("none");
      const bytes = Buffer.from(await blob.arrayBuffer());
      const tmp = `${rutaSnapshot}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, bytes);
      try {
        fs.renameSync(tmp, rutaSnapshot);
      } catch {
        if (!fs.existsSync(rutaSnapshot)) {
          throw new Error(`No se pudo escribir el snapshot PGlite en ${rutaSnapshot}`);
        }
        try {
          fs.unlinkSync(tmp);
        } catch {
          // noop
        }
      }
    } finally {
      await db.close();
    }
  }

  limpiarSnapshotsAntiguos(rutaSnapshot);
  project.provide("pgliteSnapshotPath", rutaSnapshot);
}
