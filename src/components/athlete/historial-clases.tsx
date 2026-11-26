"use client";

import * as React from "react";
import { useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  ACTIVIDAD_LABEL,
  ETIQUETA_SENSACION,
  agruparAsistenciasPorSemana,
  derivarAsistenciasLocal,
  formatearFechaClaseAsistencia,
  type AsistenciaClaseItem,
} from "@/lib/clases";

/** Asistencias a clases del alumno (servidor o derivadas localmente), con la sensación ya aplicada. */
export function useAsistenciasClases(): AsistenciaClaseItem[] {
  const resumenClases = useClasesStore((s) => s.resumenClases);
  const clases = useClasesStore((s) => s.clases);
  const misReservas = useClasesStore((s) => s.misReservas);
  const feedbacksPorReserva = useClasesStore((s) => s.feedbacksPorReserva);
  const cargarClasesAlumno = useClasesStore((s) => s.cargarClasesAlumno);
  const isOnline = useOfflineQueueStore((s) => s.isOnline);

  React.useEffect(() => {
    if (isOnline) void cargarClasesAlumno();
  }, [isOnline, cargarClasesAlumno]);

  return React.useMemo(() => {
    const base = resumenClases?.asistencias ?? derivarAsistenciasLocal(misReservas, clases, feedbacksPorReserva);
    return base.map((item) => ({
      ...item,
      sensacion: feedbacksPorReserva[item.reserva_id] ?? item.sensacion,
    }));
  }, [resumenClases, misReservas, clases, feedbacksPorReserva]);
}

/** Bloque "Historial de clases": asistencias agrupadas por semana. No renderiza nada si no hay asistencias. */
export function HistorialClases({ asistencias }: { asistencias: AsistenciaClaseItem[] }) {
  const semanas = React.useMemo(() => agruparAsistenciasPorSemana(asistencias), [asistencias]);
  if (asistencias.length === 0) return null;

  return (
    <section className="grid gap-3" aria-labelledby="historial-clases-titulo" data-testid="historial-clases-section">
      <h2 id="historial-clases-titulo" className="a-eb a-t-label">
        Historial de clases
      </h2>
      {semanas.map((sem) => (
        <div key={sem.semanaInicioClave} className="grid gap-2" data-testid="historial-clases-semana">
          <p className="a-t-label a-muted px-1">{sem.etiquetaSemana}</p>
          <div className="a-card a-days">
            {sem.items.map((item) => (
              <div key={item.reserva_id} className="a-row" data-testid="historial-clase-item">
                <span className="a-rt">
                  <b className="a-t-bs">{ACTIVIDAD_LABEL[item.actividad] || item.actividad}</b>
                  <small className="a-t-sec">{formatearFechaClaseAsistencia(item.inicio)}</small>
                  {item.nota?.trim() && (
                    <small className="a-t-sec a-muted mt-1" data-testid="historial-clase-nota">
                      {item.nota.trim()}
                    </small>
                  )}
                </span>
                {item.sensacion !== null && (
                  <span className="a-chip a-t-label" data-testid="historial-clase-sensacion">
                    {ETIQUETA_SENSACION[item.sensacion]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
