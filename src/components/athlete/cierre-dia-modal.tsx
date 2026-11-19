"use client";

import * as React from "react";
import { Trophy, Flame, Check } from "@/components/athlete/icons";
import { Tooltip1RM } from "@/components/athlete/tooltip-1rm";
import { nombreParaSaludo } from "@/lib/athlete/nombre";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const SERIES_SET_ACTIONS = new Set(["WORKOUT_SET_COMPLETED", "WORKOUT_SET_UPDATED"]);

const KG_FORMATTER = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 2,
});

function formatearKg(peso: number): string {
  return KG_FORMATTER.format(peso);
}

export interface RecordSesionItem {
  exerciseName: string;
  peso_kg: number;
  reps_hechas: number;
  tipo?: "peso" | "reps" | null;
  epley_kg?: number | null;
  delta_epley_kg?: number | null;
  numero_serie?: number;
}

export interface CierreDiaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVolverInicio?: () => void;
  tonelajeKg: number;
  seriesCompletadas: number;
  totalSeries: number;
  duracionMinutos?: number;
  duracionTexto?: string;
  rachaDias?: number;
  rachaPrevia?: number;
  metaDiasSemana?: number;
  diasCompletadosSemana?: number;
  recordsObtenidos?: RecordSesionItem[];
  studentName?: string;
  nombrePreferido?: string | null;
  diaNombre?: string;
  isOffline?: boolean;
  seriesPendientes?: number;
  esVistaTecnica?: boolean;
}

export function CierreDiaModal({
  isOpen,
  onClose,
  onVolverInicio,
  seriesCompletadas,
  totalSeries,
  duracionMinutos = 45,
  duracionTexto,
  metaDiasSemana = 3,
  diasCompletadosSemana = 1,
  recordsObtenidos = [],
  studentName,
  nombrePreferido: nombrePreferidoProp,
  diaNombre = "DÍA 1",
  isOffline: isOfflineProp,
  seriesPendientes: seriesPendientesProp,
  esVistaTecnica: esVistaTecnicaProp,
}: CierreDiaModalProps) {
  const storeNombrePreferido = useAthleteStore((s) => s.nombrePreferido);
  const nivelVistaAlumno = useAthleteStore((s) => s.nivelVistaAlumno);
  const isOnline = useOfflineQueueStore((s) => s.isOnline);
  const pendingEvents = useOfflineQueueStore((s) => s.pendingEvents);

  // Manejo de tecla Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const pendingQueueCount = pendingEvents.filter((ev) =>
    SERIES_SET_ACTIONS.has(ev.action),
  ).length;
  const effectiveOffline = isOfflineProp ?? !isOnline;
  const pendingCount = seriesPendientesProp ?? pendingQueueCount;
  const mostrarEstadoLocal = effectiveOffline || pendingCount > 0;

  const saludoNombre = nombreParaSaludo({
    nombre_preferido: nombrePreferidoProp ?? storeNombrePreferido,
    nombre_completo: studentName,
  });

  const tiempoTexto = duracionTexto || `${duracionMinutos}'`;
  const porcentajeCompletado =
    totalSeries > 0 ? Math.round((seriesCompletadas / totalSeries) * 100) : 0;
  const mostrar1RM = esVistaTecnicaProp ?? nivelVistaAlumno === "TECNICA";
  const hasRecords = recordsObtenidos && recordsObtenidos.length > 0;

  const handleActionVolver = () => {
    if (onVolverInicio) {
      onVolverInicio();
    } else {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cierre-dia-title"
      data-testid="cierre-dia-modal"
      className="a-dk a-dk-cierre"
    >
      <div className="a-dk-wedge" aria-hidden="true" />
      <div className="a-bigG" aria-hidden="true">
        G
      </div>

      <div className="a-dk-in" data-testid="cierre-dia-card">
        <span
          className="a-chip a-t-label a-dk-chip"
          data-testid="cierre-dia-estado-chip"
        >
          <Check width={12} height={12} className="a-i" />
          {mostrarEstadoLocal ? "Guardada en el teléfono" : "Guardada y sincronizada"}
        </span>

        <div className="a-grow" />

        <div className="a-dk-trophy" aria-hidden="true">
          <Trophy width={44} height={44} className="a-i" />
        </div>

        <h1
          id="cierre-dia-title"
          className="a-t-dxl"
          data-testid="cierre-dia-titulo"
        >
          ¡Gran entrenamiento{saludoNombre ? `, ${saludoNombre}` : ""}!
        </h1>

        <p className="a-t-body a-muted m-0">
          Completaste {diaNombre}
          {pendingCount > 0
            ? ` · ${pendingCount} ${
                pendingCount === 1 ? "serie se envía" : "series se envían"
              } cuando vuelva la señal`
            : ""}
        </p>

        <div className="a-tiles">
          <div className="a-card a-tile" data-testid="hero-metric-summary-card">
            <small className="a-t-label">Series</small>
            <span className="a-t-mm" data-testid="hero-metric-series">
              {`${seriesCompletadas}/${totalSeries}`}
            </span>
            <small className="a-t-sec">{porcentajeCompletado}% completadas</small>
          </div>

          <div className="a-card a-tile">
            <small className="a-t-label">Tiempo</small>
            <span className="a-t-mm" data-testid="hero-metric-tiempo">
              {tiempoTexto}
            </span>
            <small className="a-t-sec">duración de la sesión</small>
          </div>
        </div>

        <div
          className="a-card flex items-center gap-3 p-3.5"
          data-testid="cierre-dia-racha-card"
        >
          <Flame width={22} height={22} className="a-i" />
          <span className="a-rt">
            <b className="a-t-bs" data-testid="racha-dias-valor">
              {`Racha semanal: ${diasCompletadosSemana} de ${metaDiasSemana} ${
                metaDiasSemana === 1 ? "día" : "días"
              }`}
            </b>
            <small className="a-t-sec a-muted" data-testid="meta-semanal-avance">
              Cuenta solo los días de tu plan; el descanso no la corta.
            </small>
          </span>
        </div>

        {hasRecords && (
          <div className="grid gap-2" data-testid="cierre-dia-prs-section">
            {recordsObtenidos.map((rec, idx) => {
              const tiene1RM = mostrar1RM && typeof rec.epley_kg === "number" && rec.epley_kg > 0;
              return (
                <div
                  key={`${rec.exerciseName}-${idx}`}
                  data-testid={`cierre-dia-pr-item-${idx}`}
                  className="a-prc"
                >
                  <b
                    className="a-t-bs flex items-center gap-1.5"
                    data-testid={`cierre-dia-pr-badge-${idx}`}
                  >
                    <Trophy width={16} height={16} className="a-i" />
                    <span>{`Nuevo PR · ${rec.exerciseName}`}</span>
                  </b>
                  <span className="a-t-sec inline-flex items-center gap-1">
                    <span>
                      {`${formatearKg(rec.peso_kg)} kg × ${rec.reps_hechas}`}
                      {tiene1RM ? ` · 1RM ~${rec.epley_kg} kg` : ""}
                    </span>
                    {tiene1RM ? <Tooltip1RM size="sm" /> : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleActionVolver}
          data-testid="cierre-dia-volver-athlete-btn"
          className="a-btn a-dk-btn"
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
