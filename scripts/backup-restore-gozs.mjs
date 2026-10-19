#!/usr/bin/env node
// ============================================================================
// GOZS · Respaldo recuperable verificado (ADR-005, issue #64)
//
//   node scripts/backup-restore-gozs.mjs export  <snapshot.json>
//   node scripts/backup-restore-gozs.mjs verify  <snapshot.json>
//   node scripts/backup-restore-gozs.mjs restore <snapshot.json>
//
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
//
// - export:  lee las tablas de GOZS (service_role) y escribe un snapshot JSON con
//            conteo y sha256 por tabla.
// - verify:  comprueba checksums, ids únicos e integridad referencial del snapshot.
// - restore: verifica el snapshot, lo inserta con la RPC restaurar_filas_respaldo
//            (idempotente: ON CONFLICT (id) DO NOTHING) y relee la base para
//            confirmar que cada fila quedó idéntica.
//
// perfiles.id referencia auth.users: los usuarios de Auth deben existir en el
// proyecto destino antes de restaurar (el respaldo de Auth lo hace Supabase).
// ============================================================================

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const FORMATO_SNAPSHOT = "gozs-backup";
export const VERSION_SNAPSHOT = 1;

/**
 * Tablas en orden de restauración (padres antes que hijos) con sus FK hacia
 * otras tablas de public. Debe coincidir con pg_constraint: lo comprueba
 * src/__tests__/backup-restore-gozs.spec.ts. Una tabla nueva o una FK nueva
 * obliga a actualizar esta lista (y la de restaurar_filas_respaldo).
 */
export const TABLAS = [
  { nombre: "perfiles", fks: { profesor_asignado_id: "perfiles" } },
  { nombre: "ejercicios", fks: { creado_por: "perfiles" } },
  {
    nombre: "ejercicios_alternativas",
    fks: { ejercicio_alternativo_id: "ejercicios", ejercicio_origen_id: "ejercicios" },
  },
  { nombre: "entrenador_alumnos", fks: { alumno_id: "perfiles", entrenador_id: "perfiles" } },
  { nombre: "planes_entrenamiento", fks: { alumno_id: "perfiles", profesor_id: "perfiles" } },
  { nombre: "dias_rutina", fks: { plan_id: "planes_entrenamiento" } },
  { nombre: "ejercicios_en_rutina", fks: { dia_id: "dias_rutina", ejercicio_id: "ejercicios" } },
  { nombre: "registro_sesiones", fks: { alumno_id: "perfiles", dia_id: "dias_rutina" } },
  { nombre: "registro_series", fks: { ejercicio_id: "ejercicios", sesion_id: "registro_sesiones" } },
  { nombre: "conversaciones", fks: { alumno_id: "perfiles" } },
  { nombre: "mensajes", fks: { conversacion_id: "conversaciones", remitente_id: "perfiles" } },
  { nombre: "habitos_registros", fks: { alumno_id: "perfiles" } },
  { nombre: "nutricion_registros", fks: { alumno_id: "perfiles" } },
  {
    nombre: "alertas_entrenador",
    fks: {
      alumno_id: "perfiles",
      ejercicio_id: "ejercicios",
      profesor_id: "perfiles",
      resuelto_por: "perfiles",
      serie_id: "registro_series",
    },
  },
  { nombre: "alumno_historial_dolor", fks: { alumno_id: "perfiles", ejercicio_id: "ejercicios" } },
  { nombre: "alumno_cuestionario_inicial", fks: { alumno_id: "perfiles" } },
  { nombre: "contrataciones", fks: { alumno_id: "perfiles" } },
  {
    nombre: "pagos",
    fks: { alumno_id: "perfiles", confirmado_por: "perfiles", contratacion_id: "contrataciones" },
  },
  { nombre: "auditoria_cambios", fks: { autorizado_por: "perfiles" } },
  {
    nombre: "sustituciones_ejercicios",
    fks: {
      ejercicio_en_rutina_id: "ejercicios_en_rutina",
      ejercicio_original_id: "ejercicios",
      ejercicio_sustituto_id: "ejercicios",
      plan_id: "planes_entrenamiento",
      reporte_dolor_id: "alumno_historial_dolor",
      responsable_id: "perfiles",
    },
  },
];

/** JSON estable: claves ordenadas, para que el hash no dependa del orden de columnas. */
export function canonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor !== null && typeof valor === "object") {
    const claves = Object.keys(valor).sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(",")}}`;
  }
  return JSON.stringify(valor);
}

function porId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function hashFilas(filas) {
  return createHash("sha256").update(canonico([...filas].sort(porId))).digest("hex");
}

/**
 * @param fuente { leerTabla(nombre) => Promise<filas[] | null> } — null si la tabla no existe.
 */
export async function exportarSnapshot(fuente) {
  const tablas = {};
  const omitidas = [];
  for (const { nombre, opcional } of TABLAS) {
    const filas = await fuente.leerTabla(nombre);
    if (filas === null) {
      if (!opcional) throw new Error(`La tabla ${nombre} no existe en el origen`);
      omitidas.push(nombre);
      continue;
    }
    const ordenadas = [...filas].sort(porId);
    tablas[nombre] = { total: ordenadas.length, sha256: hashFilas(ordenadas), filas: ordenadas };
  }
  return {
    formato: FORMATO_SNAPSHOT,
    version: VERSION_SNAPSHOT,
    generado_at: new Date().toISOString(),
    tablas,
    omitidas,
  };
}

/** Checksums, ids únicos e integridad referencial dentro del snapshot. */
export function verificarSnapshot(snapshot) {
  const errores = [];
  if (snapshot?.formato !== FORMATO_SNAPSHOT || snapshot?.version !== VERSION_SNAPSHOT) {
    return { ok: false, errores: [`Formato de snapshot no soportado`] };
  }

  const ids = {};
  for (const { nombre, opcional } of TABLAS) {
    const tabla = snapshot.tablas?.[nombre];
    if (!tabla) {
      if (!opcional) errores.push(`${nombre}: falta en el snapshot`);
      continue;
    }
    if (tabla.filas.length !== tabla.total) {
      errores.push(`${nombre}: ${tabla.filas.length} filas, se esperaban ${tabla.total}`);
    }
    if (hashFilas(tabla.filas) !== tabla.sha256) errores.push(`${nombre}: sha256 no coincide`);
    ids[nombre] = new Set(tabla.filas.map((f) => f.id));
    if (ids[nombre].size !== tabla.filas.length) errores.push(`${nombre}: ids duplicados`);
  }

  for (const { nombre, fks } of TABLAS) {
    const tabla = snapshot.tablas?.[nombre];
    if (!tabla) continue;
    for (const [columna, referida] of Object.entries(fks)) {
      const destino = ids[referida];
      for (const fila of tabla.filas) {
        const valor = fila[columna];
        if (valor === null || valor === undefined) continue;
        if (!destino?.has(valor)) {
          errores.push(`${nombre}.${columna}=${valor} no existe en ${referida} (fila ${fila.id})`);
        }
      }
    }
  }

  return { ok: errores.length === 0, errores };
}

/** Ordena filas con FK a su misma tabla para que el padre se inserte antes que el hijo. */
export function ordenarAutoReferencias(filas, columnas) {
  if (columnas.length === 0) return filas;
  const ids = new Set(filas.map((f) => f.id));
  const colocadas = new Set();
  const resultado = [];
  let pendientes = filas;
  while (pendientes.length > 0) {
    const listas = pendientes.filter((f) =>
      columnas.every((c) => f[c] == null || f[c] === f.id || !ids.has(f[c]) || colocadas.has(f[c]))
    );
    if (listas.length === 0) throw new Error("Ciclo de auto-referencias en el snapshot");
    for (const f of listas) {
      colocadas.add(f.id);
      resultado.push(f);
    }
    pendientes = pendientes.filter((f) => !colocadas.has(f.id));
  }
  return resultado;
}

/**
 * Restaura un snapshot verificado. Idempotente: las filas existentes no se pisan.
 * @param destino { restaurarFilas(nombre, filas) => Promise<number> } — devuelve filas insertadas.
 */
export async function restaurarSnapshot(destino, snapshot, { tamanoLote = 500 } = {}) {
  const verificacion = verificarSnapshot(snapshot);
  if (!verificacion.ok) {
    throw new Error(`Snapshot inválido:\n- ${verificacion.errores.join("\n- ")}`);
  }

  const insertadas = {};
  for (const { nombre, fks } of TABLAS) {
    const tabla = snapshot.tablas[nombre];
    if (!tabla) continue;
    const autoRefs = Object.entries(fks).filter(([, ref]) => ref === nombre).map(([col]) => col);
    const filas = ordenarAutoReferencias(tabla.filas, autoRefs);
    insertadas[nombre] = 0;
    for (let i = 0; i < filas.length; i += tamanoLote) {
      insertadas[nombre] += await destino.restaurarFilas(nombre, filas.slice(i, i + tamanoLote));
    }
  }
  return insertadas;
}

/** Relee el destino y confirma que cada fila del snapshot existe y es idéntica. */
export async function verificarRestauracion(fuente, snapshot) {
  const errores = [];
  for (const { nombre } of TABLAS) {
    const tabla = snapshot.tablas[nombre];
    if (!tabla) continue;
    const actuales = await fuente.leerTabla(nombre);
    if (actuales === null) {
      errores.push(`${nombre}: no existe en el destino`);
      continue;
    }
    const porIdActual = new Map(actuales.map((f) => [f.id, canonico(f)]));
    for (const fila of tabla.filas) {
      const actual = porIdActual.get(fila.id);
      if (actual === undefined) errores.push(`${nombre}: falta la fila ${fila.id}`);
      else if (actual !== canonico(fila)) errores.push(`${nombre}: la fila ${fila.id} difiere del snapshot`);
    }
  }
  return { ok: errores.length === 0, errores };
}

// ============================================================================
// Adaptador Supabase (service_role) y CLI
// ============================================================================

const TABLA_INEXISTENTE = new Set(["42P01", "PGRST205"]);

export function crearAdaptadorSupabase(supabase, { tamanoPagina = 1000 } = {}) {
  return {
    async leerTabla(nombre) {
      const filas = [];
      for (let desde = 0; ; desde += tamanoPagina) {
        const { data, error } = await supabase
          .from(nombre)
          .select("*")
          .order("id")
          .range(desde, desde + tamanoPagina - 1);
        if (error) {
          if (TABLA_INEXISTENTE.has(error.code)) return null;
          throw new Error(`Error leyendo ${nombre}: ${error.message}`);
        }
        filas.push(...data);
        if (data.length < tamanoPagina) return filas;
      }
    },
    async restaurarFilas(nombre, filas) {
      const { data, error } = await supabase.rpc("restaurar_filas_respaldo", {
        p_tabla: nombre,
        p_filas: filas,
      });
      if (error) throw new Error(`Error restaurando ${nombre}: ${error.message}`);
      return data;
    },
  };
}

function resumen(snapshot) {
  return Object.entries(snapshot.tablas)
    .map(([nombre, t]) => `  ${nombre.padEnd(26)} ${String(t.total).padStart(6)}`)
    .join("\n");
}

async function main([comando, archivo]) {
  if (!["export", "verify", "restore"].includes(comando) || !archivo) {
    console.error("Uso: node scripts/backup-restore-gozs.mjs <export|verify|restore> <snapshot.json>");
    return 2;
  }

  if (comando === "verify") {
    const snapshot = JSON.parse(await readFile(archivo, "utf-8"));
    const { ok, errores } = verificarSnapshot(snapshot);
    console.log(ok ? `Snapshot válido:\n${resumen(snapshot)}` : `Snapshot inválido:\n- ${errores.join("\n- ")}`);
    return ok ? 0 : 1;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    return 2;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const adaptador = crearAdaptadorSupabase(
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  );

  if (comando === "export") {
    const snapshot = await exportarSnapshot(adaptador);
    await writeFile(archivo, JSON.stringify(snapshot, null, 2));
    console.log(`Respaldo escrito en ${archivo}:\n${resumen(snapshot)}`);
    if (snapshot.omitidas.length) console.log(`Omitidas (no existen): ${snapshot.omitidas.join(", ")}`);
    return 0;
  }

  const snapshot = JSON.parse(await readFile(archivo, "utf-8"));
  const insertadas = await restaurarSnapshot(adaptador, snapshot);
  const { ok, errores } = await verificarRestauracion(adaptador, snapshot);
  for (const [nombre, n] of Object.entries(insertadas)) {
    console.log(`  ${nombre.padEnd(26)} ${String(n).padStart(6)} insertadas`);
  }
  console.log(ok ? "Restauración verificada." : `Restauración con diferencias:\n- ${errores.join("\n- ")}`);
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  );
}
