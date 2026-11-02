import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

const MENSAJE_GENERICO = "No pudimos asignar la rutina. Intenta de nuevo.";

/**
 * Clona la rutina al alumno y archiva su ACTIVA anterior en una sola transacción
 * (RPC `asignar_rutina_a_alumno`). Devuelve el id del plan nuevo del alumno.
 * Ante un error lanza un Error con mensaje humano: el de la RPC si es de negocio (GZ010),
 * uno genérico si no, y deja el detalle técnico en `errores_app`.
 */
export async function asignarRutinaAAlumno(
  planId: string,
  alumnoId: string,
  client: SupabaseClient<Database> = supabase,
  nombre?: string,
): Promise<string> {
  const { data, error } = await client.rpc("asignar_rutina_a_alumno", {
    p_plan_id: planId,
    p_alumno_id: alumnoId,
    ...(nombre ? { p_nombre: nombre } : {}),
  });
  if (!error && data) return data as string;

  const mensaje = error?.code === "GZ010" ? error.message : MENSAJE_GENERICO;
  const { data: auth } = await client.auth.getUser();
  if (auth.user) {
    await client.from("errores_app").insert({
      usuario_id: auth.user.id,
      contexto: "asignar_rutina",
      mensaje_humano: mensaje,
      detalle_tecnico: error ? `${error.code}: ${error.message}` : "La RPC no devolvió el plan nuevo",
      payload_resumen: { plan_id: planId, alumno_id: alumnoId },
    });
  }
  throw new Error(mensaje);
}

/**
 * Deja el plan como único ACTIVO de su alumno: archiva la ACTIVA actual y activa el plan.
 * Si la activación falla, restaura la ACTIVA anterior para no dejar al alumno sin rutina.
 */
export async function activarRutina(
  plan: { id: string; alumno_id: string | null },
  client: SupabaseClient<Database> = supabase,
): Promise<void> {
  if (!plan.alumno_id) throw new Error("Solo se puede activar una rutina asignada a un alumno.");
  const falla = new Error("No pudimos activar la rutina. Intenta de nuevo.");
  const { data: previas, error: e1 } = await client
    .from("planes_entrenamiento")
    .update({ estado: "INACTIVO", fecha_fin: new Date().toISOString() })
    .eq("alumno_id", plan.alumno_id)
    .eq("estado", "ACTIVO")
    .neq("id", plan.id)
    .select("id");
  if (e1) throw falla;
  const { error: e2 } = await client
    .from("planes_entrenamiento")
    .update({ estado: "ACTIVO", fecha_fin: null })
    .eq("id", plan.id);
  if (e2) {
    const ids = (previas ?? []).map((p) => p.id);
    if (ids.length) await client.from("planes_entrenamiento").update({ estado: "ACTIVO", fecha_fin: null }).in("id", ids);
    throw falla;
  }
}

/** Archiva (INACTIVO) una rutina de alumno con fecha de cierre. */
export async function archivarRutina(planId: string, client: SupabaseClient<Database> = supabase): Promise<void> {
  const { error } = await client
    .from("planes_entrenamiento")
    .update({ estado: "INACTIVO", fecha_fin: new Date().toISOString() })
    .eq("id", planId);
  if (error) throw new Error("No pudimos archivar la rutina. Intenta de nuevo.");
}
