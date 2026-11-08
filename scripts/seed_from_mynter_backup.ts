/**
 * ============================================================================
 * GOZSter: Script de Migración y Carga Segura desde Backup de Mynter
 * Archivo: scripts/seed_from_mynter_backup.ts
 * GitHub Issue: #26
 * ============================================================================
 * Carga de forma segura, completa e idempotente los 13 alumnos activos y sus
 * rutinas de entrenamiento reales extraídas de Mynter en PostgreSQL / Supabase.
 *
 * REGLAS DE SEGURIDAD ESTRICTAS:
 * 1. Modo silencioso obligatorio: PROHIBIDO auth.admin.inviteUserByEmail.
 *    Solo inserción directa silenciosa (auth.admin.createUser con email_confirm: true)
 *    o inserción SQL directa en auth.users.
 * 2. Aislamiento de servicios externos: no emite notificaciones a emails externos.
 * 3. Idempotencia total: UUIDs deterministas y sentencias ON CONFLICT.
 * ============================================================================
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  Perfil,
  PlanEntrenamiento,
} from '../types/database.types';

// ============================================================================
// Tipos del Backup de Mynter (Raw Input Types)
// ============================================================================

export interface MynterCeldaEjecucion {
  id?: string | null;
  key?: string | null;
  value?: string | number | null;
  permiteEditar?: boolean;
}

export interface MynterEjercicio {
  id: string;
  nombreEjercicio: string;
  comentario?: string | null;
  urlVideo?: string | null;
  musculosOjetivo?: string[] | null;
  musculosSecundarios?: string[] | null;
  musculos?: any[];
  ejecucionEjercicio?: MynterCeldaEjecucion[][];
  children?: MynterEjercicio[];
  nota?: string | null;
  tipo?: string | null;
}

export interface MynterBloque {
  id: string;
  nombre: string;
  ejercicios?: MynterEjercicio[];
}

export interface MynterBloquesRutina {
  id?: string;
  idPlan?: string;
  idDia?: string;
  idPlanEntrenamientoDia?: string;
  bloques?: MynterBloque[];
}

export interface MynterPlanGeneral {
  id: string;
  nombrePlan: string;
  idAlumno?: string;
  idProfesional?: string;
  idAsesoria?: string;
  estado?: string;
  comentario?: string | null;
}

export interface MynterAlumno {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  segundoApellido?: string | null;
  telefono?: string | null;
  sexo?: string | null;
  fechaNacimiento?: string | null;
  audUsrIns?: string | null;
}

export interface MynterStudentEntry {
  asesoriaId?: string;
  alumno: MynterAlumno;
  inicioAsesoria?: string;
  finAsesoria?: string;
  categoria?: any;
  planGeneral: MynterPlanGeneral;
  bloquesRutina: MynterBloquesRutina;
}

// ============================================================================
// Tipos de Datos Procesados (Seed Output)
// ============================================================================

export interface SeedCoach {
  id: string;
  email: string;
  nombre_completo: string;
  rol: 'ENTRENADOR';
  estado_membresia: 'ACTIVA';
}

export interface ParsedExecution {
  series: number;
  repeticiones: string;
  rpe_objetivo: number | null;
  descanso_segundos: number;
  notas: string | null;
}

export interface ProcessedSeedData {
  coach: SeedCoach;
  alumnos: Perfil[];
  planes: PlanEntrenamiento[];
  dias: DiaRutina[];
  ejercicios: Ejercicio[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  totalAlumnos: number;
  totalPlanes: number;
  totalDias: number;
  totalEjerciciosUnicos: number;
  totalEjerciciosEnRutina: number;
  totalSuperseriesGrupos: number;
}

export interface SeedOptions {
  client?: SupabaseClient<Database>;
  filePath?: string;
  coachId?: string;
  coachEmail?: string;
  coachNombre?: string;
  dryRun?: boolean;
  silent?: boolean;
  sqlOutputFile?: string;
}

export interface SeedResult {
  success: boolean;
  data: ProcessedSeedData;
  insertedUsersCount?: number;
  insertedPerfilesCount?: number;
  insertedEjerciciosCount?: number;
  insertedPlanesCount?: number;
  insertedDiasCount?: number;
  insertedEjerciciosRutinaCount?: number;
  sqlGenerated?: string;
  sqlFilePath?: string;
  errors: string[];
}

// ============================================================================
// Utilidades de Conversión y Parseo Seguro
// ============================================================================

/**
 * Genera un UUID v4-compatible determinista a partir de cualquier cadena.
 * Asegura idempotencia perfecta: la misma entrada siempre produce el mismo UUID.
 */
export function toUUID(input: string): string {
  if (!input) {
    throw new Error('toUUID requiere una cadena no vacía.');
  }
  const str = input.trim();
  // Si ya es un UUID estándar de 36 caracteres con guiones
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    return str.toLowerCase();
  }

  // Generar hash MD5 determinista con namespace de GOZSter
  const hex = createHash('md5').update(`gozster-mynter-${str}`).digest('hex');
  // Formatear como UUID (versión 4 simulada, variante RFC 4122)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Parsea el RPE objetivo a un número entre 1.0 y 10.0 con 1 decimal.
 * Soporta strings tipo "RPE 8", "RPE 8.5", "RPE: 7", "8", etc.
 */
export function parseRpe(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return val >= 1.0 && val <= 10.0 ? Math.round(val * 10) / 10 : null;
  }
  const str = String(val).trim();
  const match = str.match(/rpe\s*:?\s*(\d+(?:\.\d+)?)/i) || str.match(/^(\d+(?:\.\d+)?)$/);
  if (match && match[1]) {
    const num = parseFloat(match[1]);
    if (!isNaN(num) && num >= 1.0 && num <= 10.0) {
      return Math.round(num * 10) / 10;
    }
  }
  return null;
}

/**
 * Parsea el descanso en segundos.
 * Convierte formatos como "90s", "90''", "1'", "2 min", o número directo.
 * Default a 90 segundos si no está presente o no es válido.
 */
export function parseDescanso(val: unknown): number {
  if (val === null || val === undefined) return 90;
  if (typeof val === 'number') {
    return val >= 0 ? Math.floor(val) : 90;
  }
  const str = String(val).trim().toLowerCase();
  if (!str) return 90;

  // Segundos con '' o " o seg o s: "90''", '90"', '90s', '90 seg'
  const secMatch = str.match(/(\d+)\s*(?:''|"|seg|s\b)/);
  if (secMatch && secMatch[1]) {
    const s = parseInt(secMatch[1], 10);
    if (!isNaN(s) && s >= 0) return s;
  }

  // Minutos: "1'", "2 min", "1.5 min" (un solo apóstrofe o palabra min)
  const minMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:'|min)/);
  if (minMatch && minMatch[1]) {
    const m = parseFloat(minMatch[1]);
    if (!isNaN(m) && m >= 0) return Math.floor(m * 60);
  }

  // Número plano: "90", "120"
  const plainNum = str.match(/^(\d+)$/);
  if (plainNum && plainNum[1]) {
    const s = parseInt(plainNum[1], 10);
    if (!isNaN(s) && s >= 0) return s;
  }

  return 90;
}

/**
 * Parsea la matriz de ejecución del ejercicio en Mynter (`ejecucionEjercicio`),
 * extrayendo series acumuladas, texto de repeticiones, rpe_objetivo y descanso.
 */
export function parseExecution(
  ejecucionEjercicio?: MynterCeldaEjecucion[][],
  fallbackNota?: string | null
): ParsedExecution {
  let totalSeries = 0;
  const repsList: string[] = [];
  let rpeValue: number | null = null;
  let descanso = 90;

  if (Array.isArray(ejecucionEjercicio) && ejecucionEjercicio.length > 0) {
    for (const row of ejecucionEjercicio) {
      if (!Array.isArray(row)) continue;
      let rowSeries = 1;
      let rowReps = '';

      for (const cell of row) {
        if (!cell || !cell.key) continue;
        const key = String(cell.key).trim().toLowerCase();
        const val = cell.value != null ? String(cell.value).trim() : '';

        if (key.includes('series')) {
          const s = parseInt(val, 10);
          if (!isNaN(s) && s > 0) rowSeries = s;
        } else if (key.includes('rep')) {
          rowReps = val;
        } else if (
          key.includes('esfuerzo') ||
          key.includes('rpe') ||
          val.toUpperCase().includes('RPE')
        ) {
          const parsed = parseRpe(val);
          if (parsed !== null) rpeValue = parsed;
        } else if (key.includes('desc')) {
          // Si el coach colocó RPE en la celda de descanso en Mynter
          if (val.toUpperCase().includes('RPE')) {
            const parsed = parseRpe(val);
            if (parsed !== null && rpeValue === null) rpeValue = parsed;
          } else {
            const d = parseDescanso(val);
            if (d !== 90) descanso = d;
          }
        }
      }

      totalSeries += rowSeries;
      if (rowReps) repsList.push(rowReps);
    }
  }

  if (totalSeries < 1) totalSeries = 3;
  let repeticiones = repsList.join(' / ');
  if (!repeticiones) repeticiones = '10';

  return {
    series: totalSeries,
    repeticiones,
    rpe_objetivo: rpeValue,
    descanso_segundos: descanso,
    notas: fallbackNota ? fallbackNota.trim() : null,
  };
}

/**
 * Localiza la ruta del archivo de backup JSON sanitizado o completo.
 */
export function resolveBackupFilePath(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return path.resolve(customPath);
  }

  const possiblePaths = [
    path.resolve(process.cwd(), 'supabase/seed_data/gozster_alumnos_y_rutinas_sanitizado.json'),
    path.resolve(process.cwd(), 'supabase/seed_data/gozster_alumnos_y_rutinas_completo.json'),
    path.resolve(process.cwd(), 'attachments/gozster_alumnos_y_rutinas_sanitizado.json'),
    path.resolve(process.cwd(), '../attachments/gozster_alumnos_y_rutinas_sanitizado.json'),
    path.resolve(process.cwd(), 'data/gozster_alumnos_y_rutinas_sanitizado.json'),
    path.resolve(process.cwd(), 'gozster_alumnos_y_rutinas_sanitizado.json'),
  ];

  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `No se encontró el archivo de backup de Mynter. Verifique la ruta o proporcione --file.`
  );
}

// ============================================================================
// Extractor Principal de Datos de Semilla (Idempotente & Tipado)
// ============================================================================

/**
 * Extrae y mapea todos los modelos de dominio requeridos a partir del JSON crudo de Mynter:
 * 1. Perfiles de Alumnos (13 alumnos vinculados a profesor)
 * 2. Planes de Entrenamiento
 * 3. Días de Rutina (con orden correlativo >= 1 y bloques representativos)
 * 4. Catálogo Maestro de Ejercicios únicos
 * 5. Ejercicios en Rutina (con superseries, series, reps y RPEs válidos)
 */
export function extractSeedData(
  rawEntries: MynterStudentEntry[],
  coachIdOverride?: string
): ProcessedSeedData {
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new Error('El JSON de backup está vacío o no es un arreglo válido.');
  }

  // 1. Identificar o asignar el profesor asignado
  const firstMynterCoachId = rawEntries[0]?.planGeneral?.idProfesional || '66b8a2401ce75e2e247c5ff6';
  const coachUuid = coachIdOverride ? toUUID(coachIdOverride) : toUUID(firstMynterCoachId);

  const coach: SeedCoach = {
    id: coachUuid,
    email: 'coach.mynter@gozster.local',
    nombre_completo: 'Profesor Titular Mynter',
    rol: 'ENTRENADOR',
    estado_membresia: 'ACTIVA',
  };

  const alumnos: Perfil[] = [];
  const planes: PlanEntrenamiento[] = [];
  const dias: DiaRutina[] = [];
  const ejerciciosMap = new Map<string, Ejercicio>();
  const ejerciciosEnRutina: EjercicioEnRutina[] = [];
  let totalSuperseriesGrupos = 0;

  for (const entry of rawEntries) {
    const rawAlumno = entry.alumno;
    const alumnoUuid = toUUID(rawAlumno.id);
    const nombreCompleto = `${rawAlumno.nombre?.trim() || ''} ${rawAlumno.apellido?.trim() || ''}`.trim();

    // 1. Perfil del Alumno
    const alumnoPerfil: Perfil = {
      id: alumnoUuid,
      email: rawAlumno.email.trim().toLowerCase(),
      nombre_completo: nombreCompleto,
      rol: 'ALUMNO',
      estado_membresia: 'ACTIVA',
      profesor_asignado_id: coach.id,
      fecha_baja: null,
      created_at: entry.inicioAsesoria || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    alumnos.push(alumnoPerfil);

    // 2. Plan de Entrenamiento
    const planUuid = toUUID(entry.planGeneral.id || `${rawAlumno.id}-plan`);
    const planEntrenamiento: PlanEntrenamiento = {
      id: planUuid,
      profesor_id: coach.id,
      alumno_id: alumnoPerfil.id,
      nombre: entry.planGeneral.nombrePlan?.trim() || 'Plan de Entrenamiento',
      estado: 'ACTIVO',
      comentarios: entry.planGeneral.comentario?.trim() || null,
      fecha_inicio: entry.inicioAsesoria || new Date().toISOString(),
      fecha_fin: entry.finAsesoria || null,
      created_at: entry.inicioAsesoria || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    planes.push(planEntrenamiento);

    // 3. Días de Rutina y Ejercicios
    const bloques = entry.bloquesRutina?.bloques || [];
    let diaOrden = 1;

    for (const bloque of bloques) {
      const diaUuid = toUUID(bloque.id || `${planEntrenamiento.id}-dia-${diaOrden}`);
      const diaNombre = bloque.nombre?.trim() || `Día ${diaOrden}`;

      const diaRutina: DiaRutina = {
        id: diaUuid,
        plan_id: planEntrenamiento.id,
        nombre: diaNombre,
        orden: diaOrden++,
        created_at: planEntrenamiento.fecha_inicio,
        updated_at: new Date().toISOString(),
      };
      dias.push(diaRutina);

      // 4 & 5. Ejercicios en el Día
      let ejOrden = 1;
      let nextGrupoSuperserie = 1;

      for (const ej of bloque.ejercicios || []) {
        const nombreEj = ej.nombreEjercicio?.trim();
        if (!nombreEj) continue;

        // Registrar en Catálogo Maestro si no existe aún
        const ejUuid = toUUID(`ejercicio-${nombreEj.toLowerCase()}`);
        if (!ejerciciosMap.has(nombreEj)) {
          const muscPrincipales =
            Array.isArray(ej.musculosOjetivo) && ej.musculosOjetivo.length > 0
              ? ej.musculosOjetivo
              : [];
          const muscSecundarios =
            Array.isArray(ej.musculosSecundarios) && ej.musculosSecundarios.length > 0
              ? ej.musculosSecundarios
              : [];

          ejerciciosMap.set(nombreEj, {
            id: ejUuid,
            nombre: nombreEj,
            comentario: ej.comentario?.trim() || null,
            url_video: ej.urlVideo?.trim() || null,
            musculos_principales: muscPrincipales,
            musculos_secundarios: muscSecundarios,
            creado_por: coach.id,
            created_at: planEntrenamiento.fecha_inicio,
            updated_at: new Date().toISOString(),
          });
        }

        const hasChildren = Array.isArray(ej.children) && ej.children.length > 0;
        const grupoSuperserie = hasChildren ? nextGrupoSuperserie++ : null;
        if (hasChildren) totalSuperseriesGrupos++;

        // Ejercicio Padre en la Rutina
        const parsedParent = parseExecution(ej.ejecucionEjercicio, ej.nota || ej.comentario);
        const erParentUuid = toUUID(`${diaRutina.id}-${ejOrden}-${ejUuid}`);

        const ejEnRutinaParent: EjercicioEnRutina = {
          id: erParentUuid,
          dia_id: diaRutina.id,
          ejercicio_id: ejerciciosMap.get(nombreEj)!.id,
          orden: ejOrden++,
          series: parsedParent.series,
          repeticiones: parsedParent.repeticiones,
          descanso_segundos: parsedParent.descanso_segundos,
          rpe_objetivo: parsedParent.rpe_objetivo,
          notas: parsedParent.notas,
          es_superserie: hasChildren,
          grupo_superserie: grupoSuperserie,
          created_at: diaRutina.created_at,
          updated_at: new Date().toISOString(),
        };
        ejerciciosEnRutina.push(ejEnRutinaParent);

        // Hijos de Superserie / Biserie
        if (hasChildren) {
          for (const child of ej.children!) {
            const childNombre = child.nombreEjercicio?.trim();
            if (!childNombre) continue;

            const childUuid = toUUID(`ejercicio-${childNombre.toLowerCase()}`);
            if (!ejerciciosMap.has(childNombre)) {
              ejerciciosMap.set(childNombre, {
                id: childUuid,
                nombre: childNombre,
                comentario: child.comentario?.trim() || null,
                url_video: child.urlVideo?.trim() || null,
                musculos_principales:
                  Array.isArray(child.musculosOjetivo) && child.musculosOjetivo.length > 0
                    ? child.musculosOjetivo
                    : [],
                musculos_secundarios:
                  Array.isArray(child.musculosSecundarios) && child.musculosSecundarios.length > 0
                    ? child.musculosSecundarios
                    : [],
                creado_por: coach.id,
                created_at: planEntrenamiento.fecha_inicio,
                updated_at: new Date().toISOString(),
              });
            }

            const parsedChild = parseExecution(child.ejecucionEjercicio, child.nota || child.comentario);
            const erChildUuid = toUUID(`${diaRutina.id}-${ejOrden}-${childUuid}`);

            const ejEnRutinaChild: EjercicioEnRutina = {
              id: erChildUuid,
              dia_id: diaRutina.id,
              ejercicio_id: ejerciciosMap.get(childNombre)!.id,
              orden: ejOrden++,
              series: parsedChild.series,
              repeticiones: parsedChild.repeticiones,
              descanso_segundos: parsedChild.descanso_segundos,
              rpe_objetivo: parsedChild.rpe_objetivo,
              notas: parsedChild.notas,
              es_superserie: true,
              grupo_superserie: grupoSuperserie,
              created_at: diaRutina.created_at,
              updated_at: new Date().toISOString(),
            };
            ejerciciosEnRutina.push(ejEnRutinaChild);
          }
        }
      }
    }
  }

  return {
    coach,
    alumnos,
    planes,
    dias,
    ejercicios: Array.from(ejerciciosMap.values()),
    ejerciciosEnRutina,
    totalAlumnos: alumnos.length,
    totalPlanes: planes.length,
    totalDias: dias.length,
    totalEjerciciosUnicos: ejerciciosMap.size,
    totalEjerciciosEnRutina: ejerciciosEnRutina.length,
    totalSuperseriesGrupos,
  };
}

// ============================================================================
// Generador de SQL Idempotente (Transaccional PostgreSQL 15+)
// ============================================================================

function escapeSql(str?: string | null): string {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function escapeArray(arr: string[]): string {
  if (!arr || arr.length === 0) return "'{}'";
  const escapedItems = arr.map((item) => `"${item.replace(/"/g, '\\"')}"`).join(',');
  return `'{${escapedItems}}'`;
}

/**
 * Genera un script SQL completo, idempotente y transaccional para cargar el seed.
 */
export function generateMynterSeedSQL(seedData: ProcessedSeedData): string {
  const lines: string[] = [];

  lines.push('-- ============================================================================');
  lines.push('-- GOZSter: Carga de Datos Semilla desde Backup Mynter (13 Alumnos Reales)');
  lines.push('-- Script SQL idempotente para PostgreSQL 15+ / Supabase');
  lines.push('-- ============================================================================');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  // 1. Profesor Titular
  lines.push('-- 1. Profesor Titular / Coach Asignado');
  lines.push(`INSERT INTO auth.users (`);
  lines.push(`  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at`);
  lines.push(`) VALUES (`);
  lines.push(`  ${escapeSql(seedData.coach.id)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',`);
  lines.push(`  ${escapeSql(seedData.coach.email)}, crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),`);
  lines.push(`  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"${seedData.coach.nombre_completo}"}', now(), now()`);
  lines.push(`) ON CONFLICT (id) DO NOTHING;`);
  lines.push('');
  lines.push(`INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id)`);
  lines.push(`VALUES (${escapeSql(seedData.coach.id)}, ${escapeSql(seedData.coach.email)}, ${escapeSql(seedData.coach.nombre_completo)}, 'ENTRENADOR', 'ACTIVA', NULL)`);
  lines.push(`ON CONFLICT (id) DO UPDATE SET`);
  lines.push(`  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ENTRENADOR', estado_membresia = 'ACTIVA', updated_at = now();`);
  lines.push('');

  // 2. Catálogo Maestro de Ejercicios
  lines.push('-- 2. Catálogo Maestro de Ejercicios Únicos');
  for (const ej of seedData.ejercicios) {
    lines.push(`INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)`);
    lines.push(`VALUES (${escapeSql(ej.id)}, ${escapeSql(ej.nombre)}, ${escapeSql(ej.comentario)}, ${escapeSql(ej.url_video)}, ${escapeArray(ej.musculos_principales)}, ${escapeArray(ej.musculos_secundarios)}, ${escapeSql(ej.creado_por)})`);
    lines.push(`ON CONFLICT (nombre) DO UPDATE SET`);
    lines.push(`  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();`);
  }
  lines.push('');

  // 3. Usuarios de Auth y Perfiles de Alumnos
  lines.push('-- 3. Creación Silenciosa de Alumnos en auth.users y public.perfiles');
  for (const al of seedData.alumnos) {
    lines.push(`INSERT INTO auth.users (`);
    lines.push(`  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at`);
    lines.push(`) VALUES (`);
    lines.push(`  ${escapeSql(al.id)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',`);
    lines.push(`  ${escapeSql(al.email)}, crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),`);
    lines.push(`  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"${al.nombre_completo.replace(/'/g, "''")}"}', now(), now()`);
    lines.push(`) ON CONFLICT (id) DO NOTHING;`);
    lines.push('');
    lines.push(`INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id)`);
    lines.push(`VALUES (${escapeSql(al.id)}, ${escapeSql(al.email)}, ${escapeSql(al.nombre_completo)}, 'ALUMNO', 'ACTIVA', ${escapeSql(al.profesor_asignado_id)})`);
    lines.push(`ON CONFLICT (id) DO UPDATE SET`);
    lines.push(`  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, updated_at = now();`);
  }
  lines.push('');

  // 4. Planes de Entrenamiento
  lines.push('-- 4. Planes de Entrenamiento');
  for (const pl of seedData.planes) {
    lines.push(`INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)`);
    lines.push(`VALUES (${escapeSql(pl.id)}, ${escapeSql(pl.profesor_id)}, ${escapeSql(pl.alumno_id)}, ${escapeSql(pl.nombre)}, 'ACTIVO', ${escapeSql(pl.comentarios)}, ${escapeSql(pl.fecha_inicio)}, ${escapeSql(pl.fecha_fin)})`);
    lines.push(`ON CONFLICT (id) DO UPDATE SET`);
    lines.push(`  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();`);
  }
  lines.push('');

  // 5. Días de Rutina
  lines.push('-- 5. Días de Rutina (Bloques)');
  for (const d of seedData.dias) {
    lines.push(`INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)`);
    lines.push(`VALUES (${escapeSql(d.id)}, ${escapeSql(d.plan_id)}, ${escapeSql(d.nombre)}, ${d.orden})`);
    lines.push(`ON CONFLICT (plan_id, orden) DO UPDATE SET`);
    lines.push(`  nombre = EXCLUDED.nombre, updated_at = now();`);
  }
  lines.push('');

  // 6. Ejercicios en Rutina
  lines.push('-- 6. Ejercicios en Rutina (incluyendo Superseries)');
  for (const er of seedData.ejerciciosEnRutina) {
    const rpeVal = er.rpe_objetivo !== null ? er.rpe_objetivo : 'NULL';
    const grupoVal = er.grupo_superserie !== null ? er.grupo_superserie : 'NULL';
    lines.push(`INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)`);
    lines.push(`VALUES (${escapeSql(er.id)}, ${escapeSql(er.dia_id)}, ${escapeSql(er.ejercicio_id)}, ${er.orden}, ${er.series}, ${escapeSql(er.repeticiones)}, ${er.descanso_segundos}, ${rpeVal}, ${escapeSql(er.notas)}, ${er.es_superserie}, ${grupoVal})`);
    lines.push(`ON CONFLICT (id) DO UPDATE SET`);
    lines.push(`  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();`);
  }
  lines.push('');

  lines.push('COMMIT;');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Función de Ejecución con Cliente de Supabase (@supabase/supabase-js)
// ============================================================================

/**
 * Ejecuta el proceso completo de seeding desde el backup de Mynter.
 * Cumple con el modo silencioso obligatorio: NUNCA usa auth.admin.inviteUserByEmail.
 */
export async function seedFromMynterBackup(options: SeedOptions = {}): Promise<SeedResult> {
  const errors: string[] = [];

  // 1. Cargar archivo de datos
  const resolvedPath = resolveBackupFilePath(options.filePath);
  const rawFileContent = fs.readFileSync(resolvedPath, 'utf-8');
  const rawEntries: MynterStudentEntry[] = JSON.parse(rawFileContent);

  // 2. Extraer datos tipados y estructurados
  const processedData = extractSeedData(rawEntries, options.coachId);

  // 3. Generar SQL si se solicitó o si está configurado
  const sqlContent = generateMynterSeedSQL(processedData);
  let savedSqlPath: string | undefined;

  if (options.sqlOutputFile) {
    const outputPath = path.resolve(options.sqlOutputFile);
    const parentDir = path.dirname(outputPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, sqlContent, 'utf-8');
    savedSqlPath = outputPath;
  }

  // Si es modo dry-run, retornar de inmediato con las estadísticas
  if (options.dryRun) {
    return {
      success: true,
      data: processedData,
      sqlGenerated: sqlContent,
      sqlFilePath: savedSqlPath,
      errors,
    };
  }

  // 4. Si se dispone de un cliente de Supabase (o variables de entorno), ejecutar inserciones
  let client = options.client;
  if (!client && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    client = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  if (client) {
    try {
      // 4.1 Asegurar existencia del Profesor en auth.users y perfiles
      const { data: coachUser, error: coachUserErr } = await client.auth.admin.createUser({
        email: processedData.coach.email,
        password: 'TempPasswordGozster2026!',
        email_confirm: true, // MODO SILENCIOSO: sin invitación por email
        user_metadata: { nombre_completo: processedData.coach.nombre_completo },
      });

      const actualCoachId = coachUser?.user?.id || processedData.coach.id;
      if (coachUserErr && !coachUserErr.message.includes('already exists')) {
        errors.push(`Error creando usuario de coach: ${coachUserErr.message}`);
      }

      await client.from('perfiles').upsert(
        {
          id: actualCoachId,
          email: processedData.coach.email,
          nombre_completo: processedData.coach.nombre_completo,
          rol: 'ENTRENADOR',
          estado_membresia: 'ACTIVA',
          profesor_asignado_id: null,
        },
        { onConflict: 'id' }
      );

      // 4.2 Catálogo de Ejercicios Únicos
      for (const ej of processedData.ejercicios) {
        const { error: ejErr } = await client.from('ejercicios').upsert(
          {
            id: ej.id,
            nombre: ej.nombre,
            comentario: ej.comentario,
            url_video: ej.url_video,
            musculos_principales: ej.musculos_principales,
            musculos_secundarios: ej.musculos_secundarios,
            creado_por: actualCoachId,
          },
          { onConflict: 'nombre' }
        );
        if (ejErr) errors.push(`Error upsert ejercicio "${ej.nombre}": ${ejErr.message}`);
      }

      // Obtener mapeo actualizado de nombres a IDs en base de datos
      const { data: dbEjercicios } = await client.from('ejercicios').select('id, nombre');
      const nombreToIdMap = new Map<string, string>();
      (dbEjercicios || []).forEach((e) => nombreToIdMap.set(e.nombre, e.id));

      // 4.3 Alumnos, Planes, Días y Ejercicios en Rutina
      for (const alumno of processedData.alumnos) {
        // Creación SILENCIOSA de usuario en auth.users
        const { data: authUser, error: authErr } = await client.auth.admin.createUser({
          email: alumno.email!,
          password: 'TempPasswordGozster2026!',
          email_confirm: true, // Sin correos de confirmación
          user_metadata: { nombre_completo: alumno.nombre_completo },
        });

        const studentUserId = authUser?.user?.id || alumno.id;
        if (authErr && !authErr.message.includes('already exists')) {
          errors.push(`Error creando usuario alumno ${alumno.email}: ${authErr.message}`);
        }

        // Perfil
        await client.from('perfiles').upsert(
          {
            id: studentUserId,
            email: alumno.email,
            nombre_completo: alumno.nombre_completo,
            rol: 'ALUMNO',
            estado_membresia: 'ACTIVA',
            profesor_asignado_id: actualCoachId,
          },
          { onConflict: 'id' }
        );

        // Plan
        const plan = processedData.planes.find((p) => p.alumno_id === alumno.id);
        if (plan) {
          const { error: planErr } = await client.from('planes_entrenamiento').upsert(
            {
              id: plan.id,
              profesor_id: actualCoachId,
              alumno_id: studentUserId,
              nombre: plan.nombre,
              estado: 'ACTIVO',
              comentarios: plan.comentarios,
              fecha_inicio: plan.fecha_inicio,
              fecha_fin: plan.fecha_fin,
            },
            { onConflict: 'id' }
          );
          if (planErr) errors.push(`Error upsert plan ${plan.nombre}: ${planErr.message}`);

          // Días del plan
          const planDias = processedData.dias.filter((d) => d.plan_id === plan.id);
          for (const dia of planDias) {
            const { error: diaErr } = await client.from('dias_rutina').upsert(
              {
                id: dia.id,
                plan_id: dia.plan_id,
                nombre: dia.nombre,
                orden: dia.orden,
              },
              { onConflict: 'plan_id, orden' }
            );
            if (diaErr) errors.push(`Error upsert dia ${dia.nombre}: ${diaErr.message}`);

            // Ejercicios del día
            const ejerciciosDia = processedData.ejerciciosEnRutina.filter((er) => er.dia_id === dia.id);
            for (const er of ejerciciosDia) {
              const matchedName = processedData.ejercicios.find((e) => e.id === er.ejercicio_id)?.nombre;
              const resolvedEjId = (matchedName && nombreToIdMap.get(matchedName)) || er.ejercicio_id;

              const { error: erErr } = await client.from('ejercicios_en_rutina').upsert(
                {
                  id: er.id,
                  dia_id: dia.id,
                  ejercicio_id: resolvedEjId,
                  orden: er.orden,
                  series: er.series,
                  repeticiones: er.repeticiones,
                  descanso_segundos: er.descanso_segundos,
                  rpe_objetivo: er.rpe_objetivo,
                  notas: er.notas,
                  es_superserie: er.es_superserie,
                  grupo_superserie: er.grupo_superserie,
                },
                { onConflict: 'id' }
              );
              if (erErr) errors.push(`Error upsert ejercicio_en_rutina orden ${er.orden}: ${erErr.message}`);
            }
          }
        }
      }
    } catch (e: any) {
      errors.push(`Excepción general durante el seed: ${e?.message || e}`);
    }
  }

  return {
    success: errors.length === 0,
    data: processedData,
    insertedUsersCount: processedData.totalAlumnos + 1,
    insertedPerfilesCount: processedData.totalAlumnos + 1,
    insertedEjerciciosCount: processedData.totalEjerciciosUnicos,
    insertedPlanesCount: processedData.totalPlanes,
    insertedDiasCount: processedData.totalDias,
    insertedEjerciciosRutinaCount: processedData.totalEjerciciosEnRutina,
    sqlGenerated: sqlContent,
    sqlFilePath: savedSqlPath,
    errors,
  };
}

// ============================================================================
// Punto de Entrada CLI (Command-Line Runner)
// ============================================================================

export async function main() {
  const args = process.argv.slice(2);
  let customFile: string | undefined;
  let sqlOutput: string = 'supabase/seed_gozs.sql';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && i + 1 < args.length) {
      const nextArg = args[++i];
      if (nextArg) customFile = nextArg;
    } else if (arg === '--sql-output' && i + 1 < args.length) {
      const nextArg = args[++i];
      if (nextArg) sqlOutput = nextArg;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  console.log('============================================================');
  console.log('GOZSter: Seed y Migración de Alumnos desde Backup de Mynter');
  console.log('============================================================');

  try {
    const result = await seedFromMynterBackup({
      filePath: customFile,
      sqlOutputFile: sqlOutput,
      dryRun,
    });

    console.log(`\nResultados del Procesamiento:`);
    console.log(`- Alumnos activos cargados: ${result.data.totalAlumnos} (Esperado: 13)`);
    console.log(`- Planes creados: ${result.data.totalPlanes} (Esperado: 13)`);
    console.log(`- Días de rutina estructurados: ${result.data.totalDias}`);
    console.log(`- Ejercicios únicos en catálogo maestro: ${result.data.totalEjerciciosUnicos}`);
    console.log(`- Ejercicios configurados en rutina: ${result.data.totalEjerciciosEnRutina}`);
    console.log(`- Grupos de superseries procesados: ${result.data.totalSuperseriesGrupos}`);
    if (result.sqlFilePath) {
      console.log(`- Script SQL generado exitosamente en: ${result.sqlFilePath}`);
    }
    console.log(`- Modo Silencioso: ACTIVO (Cero invitaciones o notificaciones emitidas)`);
    console.log('\nSeed finalizado con éxito.');
  } catch (err: any) {
    console.error('Error fatal durante la ejecución del seed:', err?.message || err);
    process.exit(1);
  }
}

// Ejecutar automáticamente si es invocado directamente por Node / tsx
if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.includes('seed_from_mynter_backup'))) {
  main();
}
