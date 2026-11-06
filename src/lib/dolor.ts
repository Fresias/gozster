/**
 * Módulo Unificado de Dolor (Escala EVA 0-10, Estado Único y Helpers de Sincronización)
 * Issue: GOZS-370 | Epic: GOZS-368 (Lote 1: Backend Cimientos BE-02)
 */

import { supabase } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export type NivelDolor = 'bajo' | 'medio' | 'alto';
export type SeveridadDolor = 'LEVE' | 'MODERADO' | 'AGUDO';
export type EstadoDolor = 'PENDIENTE' | 'ATENDIDO' | 'RESUELTO';
export type SeveridadAlerta = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export interface DolorActivo {
  id: string;
  alumno_id: string;
  alumno_nombre?: string | null;
  alumno_email?: string | null;
  ejercicio_id?: string | null;
  ejercicio_nombre?: string | null;
  zona_articular: string;
  eva: number;
  severidad: SeveridadDolor;
  nivel: NivelDolor;
  estado: EstadoDolor;
  estado_recuperacion?: 'ACTIVO' | 'EN_RECUPERACION' | 'RESUELTO';
  momento_aparicion?: string | null;
  es_sintoma_alarma: boolean;
  sintomas_alarma: string[];
  notas_alumno?: string | null;
  notas_profesor?: string | null;
  fecha_reporte: string;
  created_at: string;
  updated_at: string;
}

export interface ActualizarEstadoDolorParams {
  reporteId: string;
  nuevoEstado: EstadoDolor;
  nota?: string | null;
}

/**
 * Deriva el nivel semántico ('bajo' | 'medio' | 'alto') a partir del valor EVA (0-10).
 * - EVA 0 a 3: 'bajo'
 * - EVA 4 a 6: 'medio'
 * - EVA 7 a 10: 'alto'
 */
export function nivelDesdeEva(eva: number): NivelDolor {
  const num = Math.max(0, Math.min(10, Math.round(Number(eva) || 0)));
  if (num >= 7) return 'alto';
  if (num >= 4) return 'medio';
  return 'bajo';
}

/**
 * Deriva la severidad de base de datos ('LEVE' | 'MODERADO' | 'AGUDO') a partir de EVA (0-10).
 */
export function derivarSeveridadDesdeEva(eva: number): SeveridadDolor {
  const num = Math.max(0, Math.min(10, Math.round(Number(eva) || 0)));
  if (num >= 7) return 'AGUDO';
  if (num >= 4) return 'MODERADO';
  return 'LEVE';
}

/**
 * Deriva el valor EVA estándar a partir de la severidad textual histórica.
 */
export function derivarEvaDesdeSeveridad(severidad: string): number {
  switch (String(severidad).toUpperCase()) {
    case 'AGUDO':
      return 8;
    case 'MODERADO':
      return 5;
    case 'LEVE':
    default:
      return 3;
  }
}

/**
 * Deriva la severidad para alertas_entrenador ('BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA').
 * Síntomas de alarma (red flags) fuerzan siempre 'CRITICA'.
 */
export function derivarSeveridadAlerta(
  eva: number,
  esSintomaAlarma: boolean = false
): SeveridadAlerta {
  if (esSintomaAlarma) return 'CRITICA';
  const num = Math.max(0, Math.min(10, Math.round(Number(eva) || 0)));
  if (num >= 7) return 'ALTA';
  if (num >= 4) return 'MEDIA';
  return 'BAJA';
}

/**
 * Valida la transición de estado. Si un caso está RESUELTO y se intenta reabrir
 * a PENDIENTE o ATENDIDO, exige obligatoriamente una nota explicativa.
 */
export function validarTransicionEstadoDolor(
  estadoActual: string,
  nuevoEstado: string,
  nota?: string | null
): void {
  const actual = String(estadoActual || '').toUpperCase();
  const nuevo = String(nuevoEstado || '').toUpperCase();
  const notaLimpia = String(nota || '').trim();

  if (actual === 'RESUELTO' && (nuevo === 'PENDIENTE' || nuevo === 'ATENDIDO')) {
    if (!notaLimpia) {
      throw new Error(
        'Para reabrir un caso de dolor resuelto es obligatorio incluir una nota o motivo explicativo.'
      );
    }
  }
}

/**
 * Sincroniza y calcula los valores correspondientes para alertas_entrenador
 * a partir de un reporte o historial de dolor.
 */
export function sincronizarAlertaConHistorial(caso: Partial<DolorActivo>): {
  severidad: SeveridadAlerta;
  estado: EstadoDolor;
} {
  const eva = caso.eva !== undefined ? caso.eva : derivarEvaDesdeSeveridad(caso.severidad || 'MODERADO');
  const severidad = derivarSeveridadAlerta(eva, Boolean(caso.es_sintoma_alarma));
  const estado: EstadoDolor =
    caso.estado === 'ATENDIDO'
      ? 'ATENDIDO'
      : caso.estado === 'RESUELTO'
      ? 'RESUELTO'
      : 'PENDIENTE';

  return { severidad, estado };
}

/**
 * Helper para invocar la RPC actualizar_estado_dolor en Supabase.
 */
export async function actualizarEstadoDolor(
  params: ActualizarEstadoDolorParams,
  client: SupabaseClient | any = supabase
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const { reporteId, nuevoEstado, nota } = params;

  try {
    const { data, error } = await client.rpc('actualizar_estado_dolor', {
      p_reporte_id: reporteId,
      p_nuevo_estado: nuevoEstado,
      p_nota: nota ?? null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Error inesperado al actualizar estado de dolor' };
  }
}
