/**
 * Importador del export del sistema anterior (GOZS-154).
 *
 * Subcomando `catalogo-plantillas`: catálogo de ejercicios deduplicado +
 * plantillas de entrenamiento (planes con alumno_id NULL).
 *
 *   MYNTER_EXPORT_DIR=<carpeta fuera del repo> \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/import_mynter_export.ts catalogo-plantillas [--dry-run] [--solo-usados]
 *
 * Archivos esperados en MYNTER_EXPORT_DIR:
 *   - mynter-plantillas-*.json  ({ ejercicios: [...], plantillas: [...] })
 *   - ejercicios-duplicados.csv (opcional; columna `queda` marca el ejercicio que se conserva)
 * Escribe `mapa-ejercicios.json` (id_origen -> id_gozs) en la misma carpeta.
 *
 * Idempotente: IDs deterministas (mismo esquema hash que seed_from_mynter_backup.ts)
 * y upsert por id. Sin dependencias nuevas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { toUUID } from './seed_from_mynter_backup';

// ============================================================================
// Tipos
// ============================================================================

type Raw = Record<string, any>;

export interface EjercicioPlan {
  id: string;
  nombre: string;
  comentario: string | null;
  url_video: string | null;
  musculos_principales: string[];
  musculos_secundarios: string[];
}

export interface FilaRutina {
  id: string;
  dia_id: string;
  ejercicio_id: string;
  orden: number;
  series: number;
  repeticiones: string;
  descanso_segundos: number;
  rpe_objetivo: number | null;
  notas: string | null;
  es_superserie: boolean;
  grupo_superserie: number | null;
}

export interface PlanPlantilla {
  id: string;
  nombre: string;
  estado: 'ACTIVO' | 'INACTIVO';
}

export interface DiaPlantilla {
  id: string;
  plan_id: string;
  nombre: string;
  orden: number;
}

export interface Prescripcion {
  series: number;
  repeticiones: string;
  descanso_segundos: number;
  rpe_objetivo: number | null;
  notas: string | null;
  noInterpretados: number;
}

export interface CatalogoResultado {
  ejercicios: EjercicioPlan[];
  mapa: Record<string, string>;
  fusionados: number;
  omitidos: number;
}

export interface PlantillasResultado {
  planes: PlanPlantilla[];
  dias: DiaPlantilla[];
  rutina: FilaRutina[];
  activas: number;
  inactivas: number;
  noInterpretados: number;
}

// ============================================================================
// Normalización y parsers puros
// ============================================================================

export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const limpiarEspacios = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Mismo esquema que el seed (#26): el id sale del nombre en minúsculas. */
export const idEjercicio = (nombre: string) => toUUID(`ejercicio-${nombre.toLowerCase()}`);

/** "Esffuerzo:", "Rep.:", "Desc. " -> tipo de campo, o null si la clave no se reconoce. */
function tipoClave(key: unknown): 'series' | 'reps' | 'descanso' | 'rpe' | null {
  const k = normalizarNombre(String(key ?? '')).replace(/[:.\s]/g, '');
  if (k.startsWith('serie')) return 'series';
  if (k.startsWith('rep')) return 'reps';
  if (k.startsWith('desc')) return 'descanso';
  if (k.startsWith('esf') || k.startsWith('rpe')) return 'rpe';
  return null;
}

function aNumero(v: string): number | null {
  const m = v.replace(',', '.').match(/^\D*?(\d+(?:\.\d+)?)\D*$/);
  return m && m[1] ? parseFloat(m[1]) : null;
}

/** Segundos, o null si no se puede interpretar ("90", "90s", "90''", "1'", "2 min"). */
export function parseDescansoSegundos(v: string): number | null {
  const s = v.trim().toLowerCase().replace(',', '.');
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(?:''|"|seg|s)$/);
  if (m?.[1]) return Math.round(parseFloat(m[1]));
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|min)$/);
  if (m?.[1]) return Math.round(parseFloat(m[1]) * 60);
  m = s.match(/^(\d+)$/);
  return m?.[1] ? parseInt(m[1], 10) : null;
}

/**
 * Normaliza `ejecucionEjercicio` (filas de celdas key/value con claves mal tipeadas).
 * Lo que no se puede interpretar va a `notas`, nunca se descarta.
 */
export function parsePrescripcion(filas: unknown, notaBase?: string | null): Prescripcion {
  let series = 0;
  const reps: string[] = [];
  let descanso: number | null = null;
  let rpe: number | null = null;
  const notas: string[] = [];
  let noInterpretados = 0;
  const noInterp = (key: unknown, val: string) => {
    notas.push(`${String(key ?? '').trim()} ${val}`.trim());
    noInterpretados++;
  };

  for (const fila of Array.isArray(filas) ? filas : []) {
    let serieFila = 1;
    for (const celda of Array.isArray(fila) ? fila : []) {
      const val = celda?.value != null ? String(celda.value).trim() : '';
      if (!val) continue;
      switch (tipoClave(celda?.key)) {
        case 'series': {
          const n = aNumero(val);
          if (n !== null && Number.isInteger(n) && n >= 1) serieFila = n;
          else noInterp(celda.key, val);
          break;
        }
        case 'reps':
          reps.push(val);
          break;
        case 'descanso': {
          const d = parseDescansoSegundos(val);
          if (d !== null) descanso = d;
          else noInterp(celda.key, val);
          break;
        }
        case 'rpe': {
          const n = aNumero(val);
          if (n !== null && n >= 1 && n <= 10) rpe = Math.round(n * 10) / 10;
          else noInterp(celda.key, val);
          break;
        }
        default:
          noInterp(celda?.key, val);
      }
    }
    series += serieFila;
  }

  if (notaBase?.trim()) notas.unshift(notaBase.trim());
  return {
    series: series >= 1 ? series : 3,
    repeticiones: reps.join(' / ') || '10',
    descanso_segundos: descanso ?? 90,
    rpe_objetivo: rpe,
    notas: notas.length ? notas.join(' | ') : null,
    noInterpretados,
  };
}

/** `musculos[]` con `participacion` -> principales (>= 50 %, o el mayor) y secundarios. */
export function clasificarMusculos(musculos: unknown): {
  principales: string[];
  secundarios: string[];
} {
  const lista = (Array.isArray(musculos) ? musculos : [])
    .map((m: Raw) => ({
      nombre: String(m?.nombre ?? m?.musculo ?? m?.name ?? '').trim(),
      p: Number(m?.participacion ?? 0),
    }))
    .filter((m) => m.nombre);
  if (!lista.length) return { principales: [], secundarios: [] };
  const max = Math.max(...lista.map((m) => m.p));
  const umbral = Math.min(50, max);
  return {
    principales: lista.filter((m) => m.p >= umbral).map((m) => m.nombre),
    secundarios: lista.filter((m) => m.p < umbral && m.p > 0).map((m) => m.nombre),
  };
}

// ============================================================================
// CSV de decisiones (sin dependencias)
// ============================================================================

export function parseCsv(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  const src = texto.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (comillas) {
      if (c === '"' && src[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      fila.push(campo);
      campo = '';
      if (fila.some((x) => x !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  const [cab, ...resto] = filas;
  if (!cab) return [];
  const claves = cab.map((h) => h.trim().toLowerCase());
  return resto.map((f) => Object.fromEntries(claves.map((k, i) => [k, (f[i] ?? '').trim()])));
}

const MARCA_QUEDA = /^(si|sí|s|x|1|true|ok|queda)$/i;

// ============================================================================
// Catálogo de ejercicios
// ============================================================================

const idOrigen = (e: Raw): string => String(e?.id ?? e?._id ?? e?.idEjercicio ?? '');
const nombreOrigen = (e: Raw): string => limpiarEspacios(String(e?.nombreEjercicio ?? e?.nombre ?? ''));
const videoOrigen = (e: Raw): string | null => String(e?.urlVideo ?? e?.url_video ?? '').trim() || null;

/** Ejercicios referenciados desde las plantillas (padres e hijos), con sus conteos de uso. */
function recorrerEjerciciosPlantilla(plantilla: Raw, visitar: (e: Raw) => void): void {
  const rec = (e: Raw) => {
    visitar(e);
    for (const h of Array.isArray(e?.children) ? e.children : []) rec(h);
  };
  for (const dia of diasDePlantilla(plantilla)) for (const e of dia.ejercicios) rec(e);
}

export function construirCatalogo(
  catalogo: Raw[],
  plantillas: Raw[],
  csv: Record<string, string>[],
  opts: { soloUsados?: boolean; existentes?: { id: string; nombre: string }[] } = {}
): CatalogoResultado {
  // Entradas: catálogo + ejercicios que sólo aparecen en plantillas
  const entradas = new Map<string, Raw>();
  for (const e of catalogo) if (idOrigen(e) && nombreOrigen(e)) entradas.set(idOrigen(e), e);
  const usos = new Map<string, number>();
  for (const p of plantillas) {
    recorrerEjerciciosPlantilla(p, (e) => {
      const id = idOrigen({ id: e?.idEjercicio ?? e?.ejercicioId ?? e?.id });
      if (!id) return;
      usos.set(id, (usos.get(id) ?? 0) + 1);
      if (!entradas.has(id) && nombreOrigen(e)) entradas.set(id, e);
    });
  }

  // Clases de equivalencia: mismo nombre normalizado + fusiones marcadas en el CSV
  const padre = new Map<string, string>();
  const raiz = (x: string): string => {
    while (padre.get(x) !== x) x = padre.get(x)!;
    return x;
  };
  const unir = (a: string, b: string) => padre.set(raiz(b), raiz(a));
  for (const id of entradas.keys()) padre.set(id, id);
  const porNombre = new Map<string, string>();
  for (const [id, e] of entradas) {
    const n = normalizarNombre(nombreOrigen(e));
    const previo = porNombre.get(n);
    if (previo) unir(previo, id);
    else porNombre.set(n, id);
  }

  const marcados = new Set<string>();
  const grupos = new Map<string, string[]>();
  for (const f of csv) {
    const id = f['id_mynter'] ?? f['id_origen'] ?? '';
    if (!id || !entradas.has(id) || !f['grupo']) continue;
    grupos.set(f['grupo'], [...(grupos.get(f['grupo']) ?? []), id]);
    if (MARCA_QUEDA.test(f['queda'] ?? '')) marcados.add(id);
  }
  const keeperCsv = new Set<string>();
  for (const ids of grupos.values()) {
    const keeper = ids.find((id) => marcados.has(id));
    if (!keeper) continue; // sin decisión: quedan separados
    keeperCsv.add(keeper);
    for (const id of ids) unir(keeper, id);
  }

  const clases = new Map<string, string[]>();
  for (const id of entradas.keys()) clases.set(raiz(id), [...(clases.get(raiz(id)) ?? []), id]);

  const existentesPorNombre = new Map(
    (opts.existentes ?? []).map((e) => [normalizarNombre(e.nombre), e])
  );
  const mapa: Record<string, string> = {};
  const ejercicios: EjercicioPlan[] = [];
  let fusionados = 0;
  let omitidos = 0;

  for (const miembros of clases.values()) {
    const usosClase = miembros.reduce((s, id) => s + (usos.get(id) ?? 0), 0);
    if (opts.soloUsados && usosClase === 0) {
      omitidos++;
      continue;
    }
    const keeper =
      miembros.find((id) => keeperCsv.has(id)) ??
      [...miembros].sort(
        (a, b) =>
          (usos.get(b) ?? 0) - (usos.get(a) ?? 0) ||
          Number(!!videoOrigen(entradas.get(b)!)) - Number(!!videoOrigen(entradas.get(a)!))
      )[0]!;
    const ek = entradas.get(keeper)!;
    const nombre = nombreOrigen(ek);
    const existente = existentesPorNombre.get(normalizarNombre(nombre));
    const id = existente?.id ?? idEjercicio(nombre);

    const videoK = videoOrigen(ek);
    const alternativos = [
      ...new Set(
        miembros.map((m) => videoOrigen(entradas.get(m)!)).filter((v): v is string => !!v && v !== videoK)
      ),
    ];
    const comentario = [
      String(ek.comentario ?? '').trim(),
      ...alternativos.map((v) => `Video alternativo: ${v}`),
    ]
      .filter(Boolean)
      .join('\n');
    const { principales, secundarios } = clasificarMusculos(ek.musculos);

    ejercicios.push({
      id,
      nombre: existente?.nombre ?? nombre,
      comentario: comentario || null,
      url_video: videoK,
      musculos_principales: principales,
      musculos_secundarios: secundarios,
    });
    for (const m of miembros) mapa[m] = id;
    fusionados += miembros.length - 1;
  }
  return { ejercicios, mapa, fusionados, omitidos };
}

// ============================================================================
// Plantillas
// ============================================================================

interface DiaCrudo {
  nombre: string;
  ejercicios: Raw[];
}

/** semana -> día -> bloque -> ejercicio, aplanado a días (dias_rutina no tiene semana). */
function diasDePlantilla(p: Raw): DiaCrudo[] {
  const semanas: Raw[] = Array.isArray(p?.semanas) ? p.semanas : [{ dias: p?.dias ?? p?.bloques ?? [] }];
  const multi = semanas.length > 1;
  const out: DiaCrudo[] = [];
  semanas.forEach((s, si) => {
    const dias: Raw[] = Array.isArray(s?.dias) ? s.dias : [];
    dias.forEach((d, di) => {
      const bloques: Raw[] = Array.isArray(d?.bloques) ? d.bloques : [d];
      const base = limpiarEspacios(String(d?.nombre ?? '')) || `Día ${di + 1}`;
      out.push({
        nombre: multi ? `Semana ${si + 1} - ${base}` : base,
        ejercicios: bloques.flatMap((b) => (Array.isArray(b?.ejercicios) ? b.ejercicios : [])),
      });
    });
  });
  return out;
}

const fechaPlantilla = (p: Raw): number => {
  const t = Date.parse(String(p?.audFechaUpd ?? p?.audFechaIns ?? ''));
  return Number.isNaN(t) ? 0 : t;
};

export function construirPlantillas(
  plantillas: Raw[],
  mapa: Record<string, string>
): PlantillasResultado {
  // Más reciente por nombre -> ACTIVO; empate: la que aparece después
  const ganadora = new Map<string, number>();
  plantillas.forEach((p, i) => {
    const n = normalizarNombre(String(p?.nombre ?? p?.nombrePlan ?? ''));
    const g = ganadora.get(n);
    if (g === undefined || fechaPlantilla(p) >= fechaPlantilla(plantillas[g]!)) ganadora.set(n, i);
  });

  const res: PlantillasResultado = {
    planes: [],
    dias: [],
    rutina: [],
    activas: 0,
    inactivas: 0,
    noInterpretados: 0,
  };

  plantillas.forEach((p, i) => {
    const nombre = limpiarEspacios(String(p?.nombre ?? p?.nombrePlan ?? '')) || 'Plantilla sin nombre';
    const estado = ganadora.get(normalizarNombre(nombre)) === i ? 'ACTIVO' : 'INACTIVO';
    const planId = toUUID(`plantilla-${String(p?.id ?? p?._id ?? `${nombre}-${i}`)}`);
    res.planes.push({ id: planId, nombre, estado });
    if (estado === 'ACTIVO') res.activas++;
    else res.inactivas++;

    diasDePlantilla(p).forEach((dia, di) => {
      const diaId = toUUID(`${planId}-dia-${di + 1}`);
      res.dias.push({ id: diaId, plan_id: planId, nombre: dia.nombre, orden: di + 1 });
      let orden = 1;
      let grupo = 0;

      const agregar = (e: Raw, superserie: number | null) => {
        const origen = idOrigen({ id: e?.idEjercicio ?? e?.ejercicioId ?? e?.id });
        const ejercicioId = mapa[origen];
        if (!ejercicioId) throw new Error(`Ejercicio sin mapear en plantilla "${nombre}": ${origen || nombreOrigen(e)}`);
        const pr = parsePrescripcion(e?.ejecucionEjercicio, e?.nota ?? e?.comentario);
        res.noInterpretados += pr.noInterpretados;
        res.rutina.push({
          id: toUUID(`${diaId}-${orden}-${ejercicioId}`),
          dia_id: diaId,
          ejercicio_id: ejercicioId,
          orden: orden++,
          series: pr.series,
          repeticiones: pr.repeticiones,
          descanso_segundos: pr.descanso_segundos,
          rpe_objetivo: pr.rpe_objetivo,
          notas: pr.notas,
          es_superserie: superserie !== null,
          grupo_superserie: superserie,
        });
      };

      for (const e of dia.ejercicios) {
        const hijos: Raw[] = Array.isArray(e?.children) ? e.children : [];
        const g = hijos.length ? ++grupo : null;
        agregar(e, g);
        for (const h of hijos) agregar(h, g);
      }
    });
  });
  return res;
}

// ============================================================================
// CLI
// ============================================================================

function leerExport(dir: string): { catalogo: Raw[]; plantillas: Raw[]; csv: Record<string, string>[] } {
  const archivo = fs.readdirSync(dir).find((f) => /^mynter-plantillas.*\.json$/.test(f));
  if (!archivo) throw new Error(`No hay mynter-plantillas-*.json en ${dir}`);
  const json = JSON.parse(fs.readFileSync(path.join(dir, archivo), 'utf8'));
  const csvPath = path.join(dir, 'ejercicios-duplicados.csv');
  return {
    catalogo: json.ejercicios ?? json.catalogo ?? [],
    plantillas: json.plantillas ?? [],
    csv: fs.existsSync(csvPath) ? parseCsv(fs.readFileSync(csvPath, 'utf8')) : [],
  };
}

const lotes = <T>(xs: T[], n = 500): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

export async function catalogoPlantillas(args: string[]): Promise<void> {
  const dir = process.env.MYNTER_EXPORT_DIR;
  if (!dir) throw new Error('Definí MYNTER_EXPORT_DIR (carpeta fuera del repo).');
  const dryRun = args.includes('--dry-run');
  const { catalogo, plantillas, csv } = leerExport(dir);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!url || !key)) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (o usá --dry-run).');
  const client = !dryRun && url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

  let existentes: { id: string; nombre: string }[] = [];
  let profesorId: string | null = null;
  if (client) {
    const ej = await client.from('ejercicios').select('id, nombre');
    if (ej.error) throw new Error(ej.error.message);
    existentes = ej.data ?? [];
    const email = process.env.MYNTER_COACH_EMAIL ?? 'coach.mynter@gozster.local';
    const prof = await client.from('perfiles').select('id').eq('email', email).maybeSingle();
    if (prof.error || !prof.data) throw new Error(`No existe el perfil del entrenador (${email}). Corré antes el seed (#26).`);
    profesorId = prof.data.id;
  }

  const cat = construirCatalogo(catalogo, plantillas, csv, {
    soloUsados: args.includes('--solo-usados'),
    existentes,
  });
  const pl = construirPlantillas(plantillas, cat.mapa);
  const idsExistentes = new Set(existentes.map((e) => e.id));
  const creados = cat.ejercicios.filter((e) => !idsExistentes.has(e.id)).length;
  const errores: string[] = [];

  if (client) {
    const subir = async (tabla: string, filas: object[]) => {
      for (const lote of lotes(filas)) {
        const { error } = await client.from(tabla).upsert(lote, { onConflict: 'id' });
        if (error) errores.push(`${tabla}: ${error.message}`);
      }
    };
    await subir('ejercicios', cat.ejercicios.map((e) => ({ ...e, creado_por: profesorId })));
    await subir('planes_entrenamiento', pl.planes.map((p) => ({ ...p, profesor_id: profesorId, alumno_id: null })));
    await subir('dias_rutina', pl.dias);
    await subir('ejercicios_en_rutina', pl.rutina);
  }
  fs.writeFileSync(path.join(dir, 'mapa-ejercicios.json'), JSON.stringify(cat.mapa, null, 2));

  console.log(`Ejercicios: ${creados} creados, ${cat.ejercicios.length - creados} ya existentes, ${cat.fusionados} fusionados, ${cat.omitidos} omitidos`);
  console.log(`Plantillas: ${pl.activas} activas, ${pl.inactivas} inactivas (${pl.dias.length} días, ${pl.rutina.length} ejercicios en rutina)`);
  console.log(`Prescripciones no interpretadas (pasaron a notas): ${pl.noInterpretados}`);
  console.log(`Errores: ${errores.length}${dryRun ? ' (dry-run: no se escribió en la base)' : ''}`);
  for (const e of errores) console.error(` - ${e}`);
  if (errores.length) process.exit(1);
}

if (process.argv[1]?.includes('import_mynter_export')) {
  const [sub, ...resto] = process.argv.slice(2);
  if (sub !== 'catalogo-plantillas') {
    console.error('Uso: tsx scripts/import_mynter_export.ts catalogo-plantillas [--dry-run] [--solo-usados]');
    process.exit(1);
  }
  catalogoPlantillas(resto).catch((e) => {
    console.error('Error fatal:', e?.message ?? e);
    process.exit(1);
  });
}
