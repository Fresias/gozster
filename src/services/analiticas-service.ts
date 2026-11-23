import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

type Fn = Database["public"]["Functions"];
type Client = SupabaseClient<Database>;

export type MetricasRetencionRpc = Fn["obtener_metricas_retencion"]["Returns"][number];
export type RecordHistorico = Fn["obtener_records_historicos"]["Returns"][number];
export type PuntoSobrecarga = Fn["detectar_sobrecarga_progresiva"]["Returns"][number];

const FALLO = "No pudimos cargar las métricas.";

export async function obtenerMetricasRetencionRpc(
  profesorId?: string,
  client: Client = supabase,
): Promise<MetricasRetencionRpc> {
  const { data, error } = await client.rpc("obtener_metricas_retencion", { p_profesor_id: profesorId });
  const fila = data?.[0];
  if (error || !fila) throw new Error(FALLO);
  return fila;
}

export async function calcularVolumenSemanalRpc(
  alumnoId: string,
  desde?: string,
  client: Client = supabase,
): Promise<number> {
  const { data, error } = await client.rpc("calcular_volumen_semanal", {
    p_alumno_id: alumnoId,
    p_fecha_inicio: desde,
  });
  if (error || data === null) throw new Error(FALLO);
  return data;
}

export async function detectarSobrecargaRpc(
  alumnoId: string,
  ejercicioId: string,
  client: Client = supabase,
): Promise<PuntoSobrecarga[]> {
  const { data, error } = await client.rpc("detectar_sobrecarga_progresiva", {
    p_alumno_id: alumnoId,
    p_ejercicio_id: ejercicioId,
  });
  if (error) throw new Error(FALLO);
  return data ?? [];
}

export async function obtenerRecordsHistoricosRpc(
  alumnoId: string,
  ejercicioId?: string,
  client: Client = supabase,
): Promise<RecordHistorico[]> {
  const { data, error } = await client.rpc("obtener_records_historicos", {
    p_alumno_id: alumnoId,
    p_ejercicio_id: ejercicioId,
  });
  if (error) throw new Error(FALLO);
  return data ?? [];
}

export async function contarMensajesNoLeidosRpc(client: Client = supabase): Promise<number> {
  const { data, error } = await client.rpc("contar_mensajes_no_leidos");
  if (error || data === null) throw new Error(FALLO);
  return data;
}
