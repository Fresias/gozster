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
): Promise<string> {
  const { data, error } = await client.rpc("asignar_rutina_a_alumno", {
    p_plan_id: planId,
    p_alumno_id: alumnoId,
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
