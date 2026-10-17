import { supabase } from "@/lib/supabase/client";
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

export async function fetchLiveDatasetFromSupabase(): Promise<LiveSupabaseDataset | null> {
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

    if (alumnosRes.error) {
      console.warn("Error cargando alumnos de Supabase:", alumnosRes.error.message);
      return null;
    }

    return {
      alumnos: (alumnosRes.data as Perfil[]) || [],
      planes: (planesRes.data as PlanEntrenamiento[]) || [],
      dias: (diasRes.data as DiaRutina[]) || [],
      ejerciciosEnRutina: (ejRutinaRes.data as EjercicioEnRutina[]) || [],
      ejercicios: (ejerciciosRes.data as Ejercicio[]) || [],
    };
  } catch (err: any) {
    console.warn("Excepción al conectar con Supabase:", err?.message || err);
    return null;
  }
}
