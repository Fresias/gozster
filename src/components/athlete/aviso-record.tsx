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

  const detalle = detalleRecord(resultado, serie, nombreEjercicio);
  const epley = tecnica ? lineaEpleyRecord(resultado) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="a-record"
      data-testid="nuevo-record-banner"
    >
      <span className="a-medal" aria-hidden="true">
        <Trophy width={22} height={22} className="a-i" />
      </span>
      <span className="a-rt">
        <b className="a-t-bs">¡Nuevo récord!</b>
        <small className="a-t-sec">
          {detalle}
          {epley ? ` · ${epley}` : ""}
        </small>
      </span>
      <button
        type="button"
        onClick={onClose}
        className="a-q a-x"
        aria-label="Cerrar aviso de récord"
      >
        <X width={14} height={14} className="a-i" />
      </button>
    </div>
  );
}
