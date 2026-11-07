import type { MedioPago } from '@/types/database.types';

/**
 * Mapeo canónico de medios de pago en DB (public.pagos.medio_pago) a etiquetas visibles en UI.
 * Definición oficial: docs/ux-ui-review/09-respuesta-pm.md (P10).
 */
export const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  TRANSFERENCIA: 'Transferencia',
  EFECTIVO: 'Efectivo',
  PASARELA_ONLINE: 'Mercado Pago',
  OTRO: 'Otro',
};

/**
 * Formatea el medio de pago de base de datos a su etiqueta canónica de interfaz:
 * - 'TRANSFERENCIA'   -> 'Transferencia'
 * - 'EFECTIVO'        -> 'Efectivo'
 * - 'PASARELA_ONLINE' -> 'Mercado Pago' (también acepta 'MERCADO_PAGO')
 * - 'OTRO'            -> 'Otro'
 */
export function formatearMedioPago(medio: string | null | undefined): string {
  const limpio = String(medio ?? '').trim();
  if (!limpio) return '—';

  switch (limpio.toUpperCase()) {
    case 'TRANSFERENCIA':
      return 'Transferencia';
    case 'EFECTIVO':
      return 'Efectivo';
    case 'PASARELA_ONLINE':
    case 'MERCADO_PAGO':
    case 'MERCADO PAGO':
      return 'Mercado Pago';
    case 'OTRO':
      return 'Otro';
    default:
      return limpio;
  }
}

/**
 * Normaliza un medio de pago de entrada al valor válido del constraint de public.pagos.medio_pago.
 */
export function normalizarMedioPago(medio: string | null | undefined): MedioPago {
  const upper = String(medio ?? '').trim().toUpperCase();
  if (upper === 'EFECTIVO') return 'EFECTIVO';
  if (upper === 'PASARELA_ONLINE' || upper === 'MERCADO_PAGO' || upper === 'MERCADO PAGO') {
    return 'PASARELA_ONLINE';
  }
  if (upper === 'OTRO') return 'OTRO';
  return 'TRANSFERENCIA';
}
