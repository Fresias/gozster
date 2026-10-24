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

/** Días y ejercicios de un plan (plantilla o plan de alumno) sobre un acumulador. */
function agregarDiasYRutina(
  p: Raw,
  planId: string,
  nombre: string,
  mapa: Record<string, string>,
  res: { dias: DiaPlantilla[]; rutina: FilaRutina[]; noInterpretados: number }
): void {
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
}

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

    agregarDiasYRutina(p, planId, nombre, mapa, res);
  });
  return res;
}

// ============================================================================
// Alumnos, contrataciones y planes por alumno
// ============================================================================

export interface PerfilAlumno {
  id: string;
  email: string | null;
  nombre_completo: string;
  telefono: string | null;
  rol: 'ALUMNO';
  estado_membresia: 'ACTIVA';
  profesor_asignado_id: string;
}

export interface VinculoAlumno {
  id: string;
  entrenador_id: string;
  alumno_id: string;
  rol_entrenador: 'PRINCIPAL';
  es_principal: true;
}

export interface ContratacionAlumno {
  id: string;
  alumno_id: string;
  tipo_servicio: 'ASESORIA_ONLINE' | 'PRESENCIAL';
  estado: 'VIGENTE' | 'VENCIDA';
  dia_vencimiento: number;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface PlanAlumno extends PlanPlantilla {
  profesor_id: string;
  alumno_id: string;
  comentarios: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

export interface AlumnosResultado {
  perfiles: PerfilAlumno[];
  vinculos: VinculoAlumno[];
  contrataciones: ContratacionAlumno[];
  sinContratacion: number;
}

export interface PlanesAlumnosResultado {
  planes: PlanAlumno[];
  dias: DiaPlantilla[];
  rutina: FilaRutina[];
  sinFicha: string[];
  noInterpretados: number;
}

const aIso = (v: unknown): string | null => {
  const t = Date.parse(String(v ?? ''));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/**
 * Whitelist explícita: sólo se copian los campos listados. `pagoAlumno`, `dni`,
 * `cuentasBancarias` y `domicilio` nunca se leen.
 */
export function construirAlumnos(entradas: Raw[], profesorId: string, ahora: Date = new Date()): AlumnosResultado {
  const res: AlumnosResultado = { perfiles: [], vinculos: [], contrataciones: [], sinContratacion: 0 };
  const vistos = new Set<string>();
  for (const e of entradas) {
    const a: Raw = e?.alumno ?? {};
    const origen = String(a.id ?? e?.idAlumno ?? '');
    if (!origen || vistos.has(origen)) continue;
    vistos.add(origen);
    const id = toUUID(origen);
    const email = String(a.email ?? '').trim().toLowerCase();
    const tel = [a.codPaisTelefono, a.telefono].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
    res.perfiles.push({
      id,
      email: email || null,
      nombre_completo: limpiarEspacios(`${a.nombre ?? ''} ${a.apellido ?? ''}`),
      telefono: tel || null,
      rol: 'ALUMNO',
      estado_membresia: 'ACTIVA',
      profesor_asignado_id: profesorId,
    });
    res.vinculos.push({
      id: toUUID(`entrenador-alumno-${profesorId}-${id}`),
      entrenador_id: profesorId,
      alumno_id: id,
      rol_entrenador: 'PRINCIPAL',
      es_principal: true,
    });
    const ini = aIso(e?.inicioAsesoria)?.slice(0, 10);
    const fin = aIso(e?.finAsesoria)?.slice(0, 10);
    if (!ini || !fin || fin < ini) {
      res.sinContratacion++;
      continue;
    }
    res.contrataciones.push({
      id: toUUID(`contratacion-${String(e?.id ?? origen)}`),
      alumno_id: id,
      tipo_servicio: String(e?.modalidad ?? '').toUpperCase() === 'PRESENCIAL' ? 'PRESENCIAL' : 'ASESORIA_ONLINE',
      estado: Date.parse(`${fin}T23:59:59Z`) < ahora.getTime() ? 'VENCIDA' : 'VIGENTE',
      dia_vencimiento: Number(fin.slice(8, 10)),
      fecha_inicio: ini,
      fecha_fin: fin,
    });
  }
  return res;
}

/**
 * Planes de cada alumno del JSON de historial. Cada plan rige desde su creación
 * hasta la creación del siguiente (fecha_fin = creación del siguiente, null en el último).
 * Sólo el plan activo más reciente queda ACTIVO.
 */
export function construirPlanesAlumnos(
  alumnosHistorial: Raw[],
  mapa: Record<string, string>,
  profesorId: string,
  idsAlumnosConFicha: Set<string>
): PlanesAlumnosResultado {
  const res: PlanesAlumnosResultado = { planes: [], dias: [], rutina: [], sinFicha: [], noInterpretados: 0 };
  for (const al of alumnosHistorial) {
    const alumnoId = toUUID(String(al?.id ?? ''));
    if (!idsAlumnosConFicha.has(alumnoId)) {
      res.sinFicha.push(String(al?.id ?? ''));
      continue;
    }
    const ordenados = (Array.isArray(al?.planes) ? (al.planes as Raw[]) : [])
      .map((p, i) => ({ p, i, t: Date.parse(String(p?.audFechaIns ?? '')) || 0 }))
      .sort((x, y) => x.t - y.t || x.i - y.i);
    const esActivo = (p: Raw) => /^(ESTADO_)?ACTIVO$/i.test(String(p?.estado ?? '').trim());
    const activo = ordenados.map((x) => esActivo(x.p)).lastIndexOf(true);

    ordenados.forEach((x, k) => {
      const nombre = limpiarEspacios(String(x.p?.nombrePlan ?? x.p?.nombre ?? '')) || 'Plan de Entrenamiento';
      const planId = toUUID(String(x.p?.id ?? x.p?.idPlan ?? `${al.id}-plan-${k}`));
      const siguiente = ordenados[k + 1];
      res.planes.push({
        id: planId,
        nombre,
        estado: k === activo ? 'ACTIVO' : 'INACTIVO',
        profesor_id: profesorId,
        alumno_id: alumnoId,
        comentarios: String(x.p?.comentario ?? '').trim() || null,
        fecha_inicio: x.t ? new Date(x.t).toISOString() : null,
        fecha_fin: siguiente?.t ? new Date(siguiente.t).toISOString() : null,
      });
      agregarDiasYRutina(x.p, planId, nombre, mapa, res);
    });
  }
  return res;
}

/**
 * Si el plan ya existe (seed #26) con otros ids de día, se reutilizan esos ids
 * para actualizar en lugar de duplicar. La clave es `plan_id:orden`.
 */
export function reutilizarDias(
  dias: DiaPlantilla[],
  rutina: FilaRutina[],
  existentes: Map<string, string>
): { dias: DiaPlantilla[]; rutina: FilaRutina[] } {
  const nuevoId = new Map<string, string>();
  const diasOut = dias.map((d) => {
    const id = existentes.get(`${d.plan_id}:${d.orden}`) ?? d.id;
    nuevoId.set(d.id, id);
    return { ...d, id };
  });
  const rutinaOut = rutina.map((r) => {
    const diaId = nuevoId.get(r.dia_id) ?? r.dia_id;
    return diaId === r.dia_id ? r : { ...r, dia_id: diaId, id: toUUID(`${diaId}-${r.orden}-${r.ejercicio_id}`) };
  });
  return { dias: diasOut, rutina: rutinaOut };
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

export async function alumnosPlanes(args: string[]): Promise<void> {
  const dir = process.env.MYNTER_EXPORT_DIR;
  if (!dir) throw new Error('Definí MYNTER_EXPORT_DIR (carpeta fuera del repo).');
  const dryRun = args.includes('--dry-run');
  const leer = (re: RegExp) => {
    const f = fs.readdirSync(dir).find((n) => re.test(n));
    if (!f) throw new Error(`Falta un archivo ${re} en ${dir}`);
    return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  };
  const entradas: Raw[] = leer(/^mynter-alumnos.*\.json$/);
  const historial: Raw = leer(/^mynter-historial-completo.*\.json$/);
  const mapaPath = path.join(dir, 'mapa-ejercicios.json');
  if (!fs.existsSync(mapaPath)) throw new Error('Falta mapa-ejercicios.json: corré antes catalogo-plantillas.');
  const mapa: Record<string, string> = JSON.parse(fs.readFileSync(mapaPath, 'utf8'));

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!url || !key)) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (o usá --dry-run).');
  const client = !dryRun && url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

  let profesorId = toUUID(String(entradas[0]?.idProfesional ?? '66b8a2401ce75e2e247c5ff6'));
  if (client) {
    const email = process.env.MYNTER_COACH_EMAIL ?? 'coach.mynter@gozster.local';
    const prof = await client.from('perfiles').select('id').eq('email', email).maybeSingle();
    if (prof.error || !prof.data) throw new Error(`No existe el perfil del entrenador (${email}). Corré antes el seed (#26).`);
    profesorId = prof.data.id;
  }

  const al = construirAlumnos(entradas, profesorId);
  const pl = construirPlanesAlumnos(historial.alumnos ?? [], mapa, profesorId, new Set(al.perfiles.map((p) => p.id)));
  let { dias, rutina } = pl;
  const errores: string[] = [];

  if (client) {
    const ex = await client.from('dias_rutina').select('id, plan_id, orden').in('plan_id', pl.planes.map((p) => p.id));
    if (ex.error) throw new Error(ex.error.message);
    ({ dias, rutina } = reutilizarDias(dias, rutina, new Map((ex.data ?? []).map((d) => [`${d.plan_id}:${d.orden}`, d.id]))));
    const subir = async (tabla: string, filas: object[], onConflict = 'id') => {
      for (const lote of lotes(filas)) {
        const { error } = await client.from(tabla).upsert(lote, { onConflict });
        if (error) errores.push(`${tabla}: ${error.message}`);
      }
    };
    await subir('perfiles', al.perfiles);
    await subir('entrenador_alumnos', al.vinculos, 'entrenador_id,alumno_id');
    await subir('contrataciones', al.contrataciones);
    await subir('planes_entrenamiento', pl.planes);
    await subir('dias_rutina', dias);
    await subir('ejercicios_en_rutina', rutina);
  }

  console.log(`Alumnos: ${al.perfiles.length} (${al.contrataciones.length} contrataciones, ${al.sinContratacion} sin fechas válidas)`);
  console.log(`Planes: ${pl.planes.filter((p) => p.estado === 'ACTIVO').length} activos, ${pl.planes.filter((p) => p.estado === 'INACTIVO').length} inactivos (${dias.length} días, ${rutina.length} ejercicios en rutina)`);
  console.log(`Alumnos del historial sin ficha (omitidos): ${pl.sinFicha.length}`);
  console.log(`Prescripciones no interpretadas (pasaron a notas): ${pl.noInterpretados}`);
  console.log(`Errores: ${errores.length}${dryRun ? ' (dry-run: no se escribió en la base)' : ''}`);
  for (const e of errores) console.error(` - ${e}`);
  if (errores.length) process.exit(1);
}

if (process.argv[1]?.includes('import_mynter_export')) {
  const [sub, ...resto] = process.argv.slice(2);
  const comandos: Record<string, (a: string[]) => Promise<void>> = {
    'catalogo-plantillas': catalogoPlantillas,
    'alumnos-planes': alumnosPlanes,
  };
  const comando = comandos[sub ?? ''];
  if (!comando) {
    console.error('Uso: tsx scripts/import_mynter_export.ts <catalogo-plantillas|alumnos-planes> [--dry-run] [--solo-usados]');
    process.exit(1);
  }
  comando(resto).catch((e) => {
    console.error('Error fatal:', e?.message ?? e);
    process.exit(1);
  });
}
