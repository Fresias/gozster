// Aviso "¡Nuevo récord!" (GOZS-161, spec docs/specs/historial-progreso.md §3).
// Presentacional y puro: la decisión del récord vive en lib/record-ejercicio.
// Reemplaza al aviso verde "Serie N guardada" cuando la serie es récord (§3.2); nunca se ven los dos.

import * as React from "react";
import { Trophy, X } from "@/components/athlete/icons";
import {
  detalleRecord,
  lineaEpleyRecord,
  type ResultadoRecord,
  type SerieCandidata,
} from "@/lib/record-ejercicio";

export interface AvisoRecordProps {
  resultado: ResultadoRecord;
  serie: SerieCandidata;
  nombreEjercicio: string;
  // §3.4.4 / ADR-004: la línea de 1RM solo aparece en vista TECNICA; en SIMPLE nunca se menciona 1RM.
  tecnica?: boolean;
  onClose?: () => void;
}

export function AvisoRecord({ resultado, serie, nombreEjercicio, tecnica = false, onClose }: AvisoRecordProps) {
  if (!resultado.esRecord) return null;

  // "85 kg × 5 · tu mejor marca en Sentadilla" → carga en font-mono, resto en texto normal.
  const detalle = detalleRecord(resultado, serie, nombreEjercicio);
  const [carga, ...resto] = detalle.split(" · ");
  const epley = tecnica ? lineaEpleyRecord(resultado) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-start justify-between gap-2 rounded-xl border-2 border-warning bg-warning/15 px-3.5 py-3 text-foreground
                 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none animate-in fade-in slide-in-from-top-1"
      data-testid="nuevo-record-banner"
    >
      <div className="flex items-start gap-2.5">
        <Trophy className="h-6 w-6 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="text-base font-extrabold">¡Nuevo récord!</p>
          <p className="text-sm font-medium">
            <span className="font-mono font-bold tabular-nums">{carga}</span>
            {resto.length > 0 ? ` · ${resto.join(" · ")}` : null}
          </p>
          {epley && <p className="text-xs text-muted-foreground font-mono tabular-nums">{epley}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="-m-2 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-foreground/70 hover:text-foreground touch-manipulation"
        aria-label="Cerrar aviso de récord"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
