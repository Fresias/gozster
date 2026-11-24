import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

export interface HorarioFijo {
  id: string;
  actividad: string;
  dia_semana: number;
  hora_inicio: string;
}

export interface ClaseFijaAlumno {
  id: string;
  horario_id: string;
  actividad: string;
  dia_semana: number;
  hora_inicio: string;
}

/** Errores de negocio de las RPC (GZ00x, 42501, P0002) traen mensaje humano; el resto, genérico. */
function lanzar(error: { code?: string; message: string }, generico: string): never {
  const humano = error.code && /^(GZ\d+|42501|P0002)$/.test(error.code);
  throw new Error(humano ? error.message : generico);
}

export async function asignarClaseFijaRpc(
  horarioId: string,
  alumnoId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<string> {
  const { data, error } = await client.rpc("asignar_clase_fija", {
    p_horario_id: horarioId,
    p_alumno_id: alumnoId,
  });
  if (error) lanzar(error, "No pudimos fijar la clase. Intenta de nuevo.");
  return data;
}

export async function quitarClaseFijaRpc(
  claseFijaId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<void> {
  const { error } = await client.rpc("quitar_clase_fija", { p_clase_fija_id: claseFijaId });
  if (error) lanzar(error, "No pudimos quitar la clase fija. Intenta de nuevo.");
}

export async function listarHorariosActivos(
  client: SupabaseClient<Database> = supabase,
): Promise<HorarioFijo[]> {
  const { data, error } = await client
    .from("clases_horario")
    .select("id, actividad, dia_semana, hora_inicio")
    .eq("activo", true)
    .order("dia_semana")
    .order("hora_inicio");
  if (error) throw new Error("No pudimos cargar los horarios.");
  return (data ?? []) as HorarioFijo[];
}

export async function listarClasesFijasAlumno(
  alumnoId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<ClaseFijaAlumno[]> {
  const { data, error } = await client
    .from("clases_fijas")
    .select("id, horario_id, clases_horario(actividad, dia_semana, hora_inicio)")
    .eq("alumno_id", alumnoId);
  if (error) throw new Error("No pudimos cargar las clases fijas.");
  return (data ?? []).flatMap((f) => {
    const h = Array.isArray(f.clases_horario) ? f.clases_horario[0] : f.clases_horario;
    return h
      ? [{ id: f.id, horario_id: f.horario_id, actividad: h.actividad, dia_semana: h.dia_semana, hora_inicio: h.hora_inicio }]
      : [];
  });
}
