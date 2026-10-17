import { supabase } from "@/lib/supabase/client";
import {
  REAL_ALUMNOS,
  REAL_PLANES,
  REAL_DIAS,
  REAL_EJERCICIOS,
  REAL_EJERCICIOS_RUTINA,
} from "@/services/real-mynter-data";
import type {
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

export async function fetchLiveDatasetFromSupabase(): Promise<LiveSupabaseDataset> {
  try {
    const [
      alumnosRes,
      planesRes,
      diasRes,
      ejRutinaRes,
      ejerciciosRes,
    ] = await Promise.all([
      supabase.from("perfiles").select("*").eq("rol", "ALUMNO").order("nombre_completo", { ascending: true }),
      supabase.from("planes_entrenamiento").select("*").order("created_at", { ascending: false }),
      supabase.from("dias_rutina").select("*").order("orden", { ascending: true }),
      supabase.from("ejercicios_en_rutina").select("*").order("orden", { ascending: true }),
      supabase.from("ejercicios").select("*").order("nombre", { ascending: true }),
    ]);

    if (alumnosRes.error || !alumnosRes.data || alumnosRes.data.length === 0) {
      if (alumnosRes.error) {
        console.warn("Aviso cargando alumnos de Supabase (usando dataset sanitizado Mynter):", alumnosRes.error.message);
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
    console.warn("Excepción al conectar con Supabase (usando dataset sanitizado Mynter):", err?.message || err);
    return {
      alumnos: REAL_ALUMNOS,
      planes: REAL_PLANES,
      dias: REAL_DIAS,
      ejerciciosEnRutina: REAL_EJERCICIOS_RUTINA,
      ejercicios: REAL_EJERCICIOS,
    };
  }
}
