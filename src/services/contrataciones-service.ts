import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

type Contratacion = Database["public"]["Tables"]["contrataciones"]["Row"];

/** Mensaje de la RPC (errores de negocio con mensaje humano) o uno genérico. */
function lanzar(error: { code?: string; message: string }, generico: string): never {
  const humano = error.code && /^(GZ\d+|22023|42501|P0002)$/.test(error.code);
  throw new Error(humano ? error.message : generico);
}

/** RPC `extender_contratacion_excepcional`: devuelve la contratación ya persistida. */
export async function extenderContratacionExcepcionalRpc(
  input: { contratacionId: string; nuevaFechaFin: string; motivo: string },
  client: SupabaseClient<Database> = supabase,
): Promise<Contratacion> {
  const { data, error } = await client.rpc("extender_contratacion_excepcional", {
    p_contratacion_id: input.contratacionId,
    p_nueva_fecha_fin: input.nuevaFechaFin,
    p_motivo: input.motivo,
  });
  if (error) lanzar(error, "No pudimos extender la contratación. Intenta de nuevo.");
  const fila = (Array.isArray(data) ? data[0] : data) as Contratacion | undefined;
  if (!fila) throw new Error("No pudimos extender la contratación. Intenta de nuevo.");
  return fila;
}

/** RPC `renovar_contratacion`: cuota del período siguiente + pago + extensión, idempotente por clave. */
export async function renovarContratacionRpc(
  input: { contratacionId: string; monto: number; medioPago: string; idempotencyKey: string },
  client: SupabaseClient<Database> = supabase,
): Promise<{ fechaFin: string; estado: string }> {
  const { data, error } = await client.rpc("renovar_contratacion", {
    p_contratacion_id: input.contratacionId,
    p_monto: input.monto,
    p_medio_pago: input.medioPago,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) lanzar(error, "No pudimos registrar la renovación. Intenta de nuevo.");
  const fila = data?.[0];
  if (!fila) throw new Error("No pudimos registrar la renovación. Intenta de nuevo.");
  return { fechaFin: fila.fecha_fin, estado: fila.estado };
}
