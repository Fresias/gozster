import type { SupabaseClient } from "@supabase/supabase-js";
import { diasSinPR, estaEstancado } from "@/lib/estancamiento";
import type { SerieHistorica } from "@/lib/historial-ejercicio";
import { supabase } from "@/lib/supabase/client";
import {
  REAL_ALUMNOS,
  REAL_PLANES,
  REAL_DIAS,
  REAL_EJERCICIOS,
  REAL_EJERCICIOS_RUTINA,
} from "@/services/real-mynter-data";
import type {
  Database,
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";

export interface LiveSupabaseDataset {
  alumnos: Perfil[];
  planes: PlanEntrenamiento[];
  dias: DiaRutina[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  ejercicios: Ejercicio[];
}

/**
 * Carga el dataset en vivo desde Supabase.
 * Acepta un cliente explícito: desde un Server Component se pasa el cliente de servidor
 * autenticado (`@/lib/supabase/server`) para que PostgREST reciba el JWT del entrenador y
 * aplique RLS (solo sus alumnos). En el navegador usa por defecto el cliente con sesión por cookies.
 */
export async function fetchLiveDatasetFromSupabase(
  client: SupabaseClient<Database> = supabase,
): Promise<LiveSupabaseDataset> {
  try {
    const [
      alumnosRes,
      planesRes,
      diasRes,
      ejRutinaRes,
      ejerciciosRes,
    ] = await Promise.all([
      client.from("perfiles").select("*").eq("rol", "ALUMNO").order("nombre_completo", { ascending: true }),
      client.from("planes_entrenamiento").select("*").order("created_at", { ascending: false }),
      client.from("dias_rutina").select("*").order("orden", { ascending: true }),
      client.from("ejercicios_en_rutina").select("*").order("orden", { ascending: true }),
      client.from("ejercicios").select("*").order("nombre", { ascending: true }),
    ]);

    if (alumnosRes.error || !alumnosRes.data || alumnosRes.data.length === 0) {
      if (alumnosRes.error) {
        console.warn("Aviso cargando alumnos de Supabase (usando dataset GOZS de respaldo):", alumnosRes.error.message);
      }
      return {
        alumnos: REAL_ALUMNOS,
        planes: REAL_PLANES,
        dias: REAL_DIAS,
        ejerciciosEnRutina: REAL_EJERCICIOS_RUTINA,
        ejercicios: REAL_EJERCICIOS,
      };
    }

    return {
      alumnos: (alumnosRes.data as Perfil[]) || [],
      planes: (planesRes.data as PlanEntrenamiento[]) || [],
      dias: (diasRes.data as DiaRutina[]) || [],
      ejerciciosEnRutina: (ejRutinaRes.data as EjercicioEnRutina[]) || [],
      ejercicios: (ejerciciosRes.data as Ejercicio[]) || [],
    };
  } catch (err: any) {
    console.warn("Excepción al conectar con Supabase (usando dataset GOZS de respaldo):", err?.message || err);
    return {
      alumnos: REAL_ALUMNOS,
      planes: REAL_PLANES,
      dias: REAL_DIAS,
      ejerciciosEnRutina: REAL_EJERCICIOS_RUTINA,
      ejercicios: REAL_EJERCICIOS,
    };
  }
}

export interface AlumnoEstancado {
  alumnoId: string;
  diasSinPR: number;
}

/** Alumnos con 30+ días sin PR habiendo entrenado (GOZS-226). RLS limita a los alumnos del coach. */
export async function fetchAlumnosEstancados(client: SupabaseClient<Database> = supabase): Promise<AlumnoEstancado[]> {
  const porAlumno = new Map<string, SerieHistorica[]>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await client
      .from("registro_series")
      .select("ejercicio_id, sesion_id, numero_serie, peso_kg, reps_hechas, rpe_real, completada, set_type, registro_sesiones!inner(fecha, alumno_id)")
      .eq("completada", true)
      .order("id")
      .range(desde, desde + 999);
    if (error || !data) return [];
    for (const { registro_sesiones, ...s } of data as any[]) {
      const lista = porAlumno.get(registro_sesiones.alumno_id) ?? [];
      lista.push({ ...s, fecha: registro_sesiones.fecha });
      porAlumno.set(registro_sesiones.alumno_id, lista);
    }
    if (data.length < 1000) break;
  }
  return [...porAlumno]
    .filter(([, series]) => estaEstancado(series))
    .map(([alumnoId, series]) => ({ alumnoId, diasSinPR: diasSinPR(series) }))
    .sort((a, b) => b.diasSinPR - a.diasSinPR);
}
