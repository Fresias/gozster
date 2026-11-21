import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type {
  ActividadAlumno,
  AlumnoActividad,
  Cobro,
  Contratacion,
  Database,
  MedioPago,
  Pago,
  PlanMembresia,
} from "@/types/database.types";

export interface CobrosSupabaseDataset {
  cobros: Cobro[];
  contrataciones: Contratacion[];
  planesMembresia: PlanMembresia[];
  pagos: Pago[];
  alumnoActividades: AlumnoActividad[];
}

export interface AsignarSuscripcionYCobroParams {
  alumnoId: string;
  planId?: string | null;
  actividad?: ActividadAlumno | null;
  monto?: number | null;
  pagado?: boolean;
  medioPago?: MedioPago | "MERCADO_PAGO";
  esAdicional?: boolean;
  concepto?: string | null;
  nota?: string | null;
  vecesPorSemana?: number | null;
  paseLibre?: boolean;
}

export interface AsignarSuscripcionYCobroResultado {
  contratacion_id: string;
  cobro_id: string;
  pago_id: string | null;
  estado_cobro: "PENDIENTE" | "PAGADO" | "VENCIDO";
  monto: number;
  concepto: string | null;
}

export interface RegistrarPagoParams {
  cobroId: string;
  monto: number;
  metodo: MedioPago | "MERCADO_PAGO";
  nota?: string | null;
}

/**
 * Carga cobros, contrataciones, planes de membresía, pagos y actividades desde Supabase
 * bajo RLS del usuario autenticado.
 */
export async function fetchCobrosDatasetFromSupabase(
  client: SupabaseClient<Database> = supabase,
): Promise<CobrosSupabaseDataset> {
  const [
    cobrosRes,
    contratacionesRes,
    planesMembresiaRes,
    pagosRes,
    alumnoActividadesRes,
  ] = await Promise.all([
    client.from("cobros").select("*").order("fecha_vencimiento", { ascending: false }),
    client.from("contrataciones").select("*").order("created_at", { ascending: false }),
    client.from("planes_membresia").select("*").order("precio", { ascending: true }),
    client.from("pagos").select("*").order("created_at", { ascending: false }),
    client.from("alumno_actividades").select("*").order("created_at", { ascending: true }),
  ]);

  if (cobrosRes.error) {
    throw new Error(`No se pudieron cargar los cobros: ${cobrosRes.error.message}`);
  }
  if (contratacionesRes.error) {
    throw new Error(`No se pudieron cargar las contrataciones: ${contratacionesRes.error.message}`);
  }
  if (planesMembresiaRes.error) {
    throw new Error(`No se pudieron cargar los planes de membresía: ${planesMembresiaRes.error.message}`);
  }
  if (pagosRes.error) {
    throw new Error(`No se pudieron cargar los pagos: ${pagosRes.error.message}`);
  }
  if (alumnoActividadesRes.error) {
    throw new Error(`No se pudieron cargar las actividades: ${alumnoActividadesRes.error.message}`);
  }

  return {
    cobros: (cobrosRes.data as Cobro[]) ?? [],
    contrataciones: (contratacionesRes.data as Contratacion[]) ?? [],
    planesMembresia: (planesMembresiaRes.data as PlanMembresia[]) ?? [],
    pagos: (pagosRes.data as Pago[]) ?? [],
    alumnoActividades: (alumnoActividadesRes.data as AlumnoActividad[]) ?? [],
  };
}

/**
 * Invoca la RPC transaccional `asignar_suscripcion_y_cobro` en Supabase.
 */
export async function asignarSuscripcionYCobro(
  params: AsignarSuscripcionYCobroParams,
  client: SupabaseClient<Database> = supabase,
): Promise<AsignarSuscripcionYCobroResultado> {
  const { data, error } = await client.rpc("asignar_suscripcion_y_cobro", {
    p_alumno_id: params.alumnoId,
    p_plan_id: params.planId ?? null,
    p_actividad: params.actividad ?? null,
    p_monto: params.monto ?? null,
    p_pagado: params.pagado ?? false,
    p_medio_pago: params.medioPago ?? "TRANSFERENCIA",
    p_es_adicional: params.esAdicional ?? true,
    p_concepto: params.concepto ?? null,
    p_nota: params.nota ?? null,
    p_veces_por_semana: params.vecesPorSemana ?? null,
    p_pase_libre: params.paseLibre ?? false,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("La RPC asignar_suscripcion_y_cobro no devolvió resultado.");
  }
  return row as AsignarSuscripcionYCobroResultado;
}

/**
 * Invoca la RPC `registrar_pago` en Supabase permitiendo monto ajustado y nota opcional.
 */
export async function registrarPagoReal(
  params: RegistrarPagoParams,
  client: SupabaseClient<Database> = supabase,
): Promise<Cobro> {
  const { data, error } = await client.rpc("registrar_pago", {
    p_cobro_id: params.cobroId,
    p_monto: params.monto,
    p_metodo: params.metodo,
    p_nota: params.nota ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("La RPC registrar_pago no devolvió el cobro actualizado.");
  }
  return data as Cobro;
}
