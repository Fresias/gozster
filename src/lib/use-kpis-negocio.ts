"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import {
  obtenerKpisNegocio,
  rangoPeriodo,
  puedeVerMontos,
  type KpisNegocio,
  type TipoRangoPeriodo,
} from "@/lib/kpis-negocio";

export interface UseKpisNegocioOptions {
  periodo?: TipoRangoPeriodo;
  rol?: string | null;
  fecha?: Date;
  isLiveMode?: boolean;
  initialKpis?: KpisNegocio | null;
}

export interface UseKpisNegocioResult {
  kpis: KpisNegocio | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  puedeVer: boolean;
}

/**
 * Hook reactivo unificado para consumir la fuente única de verdad KpisNegocio (FIX-06).
 * Sincronizado con el período ('semana', 'mes', 'trimestre') y reglas de permisos de rol.
 * En modo en vivo, si falla la RPC, expone isError=true sin fallback a DEMO_*.
 */
export function useKpisNegocio({
  periodo = "mes",
  rol = "ADMIN",
  fecha = new Date(),
  isLiveMode = false,
  initialKpis = null,
}: UseKpisNegocioOptions = {}): UseKpisNegocioResult {
  const [kpis, setKpis] = React.useState<KpisNegocio | null>(initialKpis);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isError, setIsError] = React.useState<boolean>(false);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchKpis = React.useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    setError(null);
    try {
      const rango = rangoPeriodo(periodo, fecha);
      const data = await obtenerKpisNegocio(supabase, {
        desde: rango.desde,
        hasta: rango.hasta,
        rol,
        fecha,
      });
      setKpis(data);
    } catch (err: unknown) {
      if (isLiveMode) {
        setIsError(true);
        setError(err instanceof Error ? err : new Error(String(err)));
        setKpis(null);
      } else if (initialKpis) {
        setKpis(initialKpis);
      }
    } finally {
      setIsLoading(false);
    }
  }, [periodo, rol, fecha, isLiveMode, initialKpis]);

  React.useEffect(() => {
    if (isLiveMode) {
      fetchKpis();
    }
  }, [fetchKpis, isLiveMode]);

  return {
    kpis,
    isLoading,
    isError,
    error,
    refetch: fetchKpis,
    puedeVer: puedeVerMontos(rol),
  };
}
