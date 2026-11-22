import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { supabase as defaultSupabase } from "@/lib/supabase/client";

export type TipoLogroRacha = "diamante";

export interface LogroRachaRow {
  id: string;
  alumno_id: string;
  numero_ciclo: number;
  tipo: TipoLogroRacha;
  fecha_logro: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee la cantidad de logros Diamante permanentes del alumno (`logros_racha`).
 * Si el backend aún no está migrado o no hay red/sesión, devuelve `0` como fallback seguro.
 */
export async function leerCantidadDiamantes(
  alumnoId: string,
  client: SupabaseClient<Database> = defaultSupabase,
): Promise<number> {
  if (!alumnoId || !UUID_REGEX.test(alumnoId)) return 0;
  try {
    const { count, error } = await (client as any)
      .from("logros_racha")
      .select("id", { count: "exact", head: true })
      .eq("alumno_id", alumnoId)
      .eq("tipo", "diamante");

    if (error) return 0;
    return typeof count === "number" && count >= 0 ? count : 0;
  } catch {
    return 0;
  }
}

/**
 * Registra de forma idempotente el logro Diamante al completar la semana 52 de un ciclo.
 * Usa `onConflict: "alumno_id,numero_ciclo,tipo"` con `ignoreDuplicates: true` (ON CONFLICT DO NOTHING).
 */
export async function registrarLogroRachaIdempotente(
  params: {
    alumnoId: string;
    numeroCiclo: number;
    tipo?: TipoLogroRacha;
  },
  client: SupabaseClient<Database> = defaultSupabase,
): Promise<{ ok: boolean; error?: { code?: string; message?: string } }> {
  const { alumnoId, numeroCiclo, tipo = "diamante" } = params;
  if (!alumnoId || !UUID_REGEX.test(alumnoId) || !Number.isInteger(numeroCiclo) || numeroCiclo < 1) {
    return { ok: false, error: { code: "23514", message: "Parámetros inválidos de logro_racha" } };
  }

  try {
    const { error } = await (client as any).from("logros_racha").upsert(
      {
        alumno_id: alumnoId,
        numero_ciclo: numeroCiclo,
        tipo,
      },
      {
        onConflict: "alumno_id,numero_ciclo,tipo",
        ignoreDuplicates: true,
      },
    );

    if (error) {
      return {
        ok: false,
        error: {
          code: typeof error.code === "string" ? error.code : undefined,
          message: typeof error.message === "string" ? error.message : undefined,
        },
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: { message: "Error de red al registrar logro_racha" } };
  }
}
