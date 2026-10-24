import * as React from "react";
import { History } from "@/components/athlete/icons";
import {
  ariaUltimaVez,
  formatearCarga,
  formatearFechaCorta,
  serieDeReferencia,
  type UltimaVezEjercicio,
} from "@/lib/historial-ejercicio";

// "La última vez" (spec historial-progreso §1). `ultima`: undefined = no consultado, null = sin historial.
export function UltimaVez({
  ultima,
  numeroSerie,
  cargando = false,
  compacta = false,
}: {
  ultima: UltimaVezEjercicio | null | undefined;
  numeroSerie: number;
  cargando?: boolean;
  compacta?: boolean;
}) {
  const texto = compacta ? "text-xs" : "text-sm";

  if (ultima === undefined && cargando) {
    return (
      <div className={`flex items-center ${compacta ? "h-4" : "h-5"}`} data-testid="ultima-vez-cargando" aria-hidden="true">
        <span className="h-4 w-44 rounded bg-muted animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }

  const ref = ultima ? serieDeReferencia(ultima, numeroSerie) : null;
  if (!ultima || !ref) {
    return (
      <p className={`${texto} font-medium text-muted-foreground`} data-testid="ultima-vez-vacia">
        Primera vez con este ejercicio
      </p>
    );
  }

  return (
    <p
      className={`flex items-center gap-1.5 ${texto} font-medium text-muted-foreground`}
      data-testid="ultima-vez"
      aria-label={ariaUltimaVez(ultima.fecha, ref)}
    >
      {!compacta && <History className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span>Última vez:</span>
      <span className="font-mono font-bold tabular-nums text-foreground">{formatearCarga(ref)}</span>
      <span aria-hidden="true">·</span>
      <span className="font-mono tabular-nums">{formatearFechaCorta(ultima.fecha)}</span>
    </p>
  );
}
