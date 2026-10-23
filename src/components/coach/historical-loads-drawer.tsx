import * as React from "react";
import type { DiaRutina, MotivoCambioDia, Perfil } from "@/types/database.types";
import { type HistoricalLoadEntry } from "@/services/coach-mock-data";
import { useCoachStudioStore } from "@/store/use-coach-studio";

export const MOTIVOS_CAMBIO_DIA_MAP: Record<MotivoCambioDia, string> = {
  CANSANCIO_DEPORTE: "Cansancio / otro deporte",
  MOLESTIA: "Molestia",
  POCO_TIEMPO: "Poco tiempo",
  EQUIPO_OCUPADO: "Máquina ocupada",
};

export function formatCambioDia(
  diaSugeridoId: string | null | undefined,
  diaId: string | null | undefined,
  motivo: MotivoCambioDia | null | undefined,
  dias: DiaRutina[] = [],
): string | null {
  if (!diaSugeridoId && !motivo) return null;

  const resolveLabel = (id: string | null | undefined): string => {
    if (!id) return "Día";
    const found = dias.find((d) => d.id === id);
    if (found) return `Día ${found.orden}`;
    const match = id.match(/\d+/);
    if (match) return `Día ${match[0]}`;
    return id;
  };

  const sugeridoLabel = resolveLabel(diaSugeridoId);
  const hechoLabel = resolveLabel(diaId);
  const motivoTexto = motivo ? MOTIVOS_CAMBIO_DIA_MAP[motivo] || motivo : null;

  if (motivoTexto) {
    return `Cambió ${sugeridoLabel} → ${hechoLabel} · ${motivoTexto}`;
  }
  return `Cambió ${sugeridoLabel} → ${hechoLabel}`;
}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
} from "@/lib/strength-metrics";

export interface HistoricalLoadsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alumno: Perfil | null;
  historial: HistoricalLoadEntry[];
  dias?: DiaRutina[];
}

export function HistoricalLoadsDrawer({
  isOpen,
  onClose,
  alumno,
  historial,
  dias: diasProp,
}: HistoricalLoadsDrawerProps) {
  const storeDias = useCoachStudioStore((state) => state.dias);
  const diasList = diasProp || storeDias || [];
  if (!isOpen || !alumno) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="historical-drawer-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm transition-opacity"
    >
      <div className="flex h-full w-full max-w-lg flex-col bg-card text-card-foreground shadow-2xl transition-transform duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
          <div>
            <h2
              id="historical-drawer-title"
              className="text-lg font-bold tracking-tight text-foreground"
            >
              Cargas y RPE Históricos
            </h2>
            <p className="text-xs text-muted-foreground">
              Atleta:{" "}
              <span className="font-semibold text-foreground">
                {alumno.nombre_completo}
              </span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar panel de historial"
            className="min-h-11 min-w-11 text-xs"
          >
            ✕ Cerrar
          </Button>
        </div>

        {/* Content list */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {historial.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No hay registros de cargas previas para este alumno.
              </p>
            </div>
          ) : (
            historial.map((entry, idx) => {
              const fechaFormatted = new Date(entry.sesion.fecha).toLocaleDateString(
                "es-AR",
                {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                },
              );

              return (
                <div
                  key={entry.sesion.id}
                  className="rounded-lg border border-border bg-background/50 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div>
                      <span className="text-xs font-bold uppercase text-primary">
                        Sesión #{historial.length - idx}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {fechaFormatted}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-foreground">
                        Volumen: {entry.sesion.volumen_total_kg} kg
                      </span>
                      {entry.sesion.duracion_minutos && (
                        <p className="text-[11px] text-muted-foreground">
                          {entry.sesion.duracion_minutos} min
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Línea discreta de cambio de día (GOZS-149) */}
                  {(() => {
                    const cambioTexto = formatCambioDia(
                      entry.sesion.dia_sugerido_id,
                      entry.sesion.dia_id,
                      entry.sesion.motivo_cambio_dia,
                      diasList,
                    );
                    if (!cambioTexto) return null;
                    return (
                      <div
                        className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400"
                        data-testid="sesion-cambio-dia-info"
                      >
                        {cambioTexto}
                      </div>
                    );
                  })()}

                  {/* Series del entrenamiento */}
                  <div className="mt-3 space-y-2.5">
                    {entry.series.map((serie) => {
                      const epley1rm = calculateEpley1RM(
                        serie.peso_kg,
                        serie.reps_hechas,
                      );
                      const brzycki1rm = calculateBrzycki1RM(
                        serie.peso_kg,
                        serie.reps_hechas,
                      );
                      const volumenSerie = calculateBlockVolume(
                        1,
                        serie.reps_hechas,
                        serie.peso_kg,
                      );

                      return (
                        <div
                          key={serie.id}
                          className="rounded-md border border-border/40 bg-secondary/30 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">
                              {serie.ejercicioNombre}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              Serie {serie.numero_serie}
                            </Badge>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div className="rounded bg-background/80 p-1.5 text-center">
                              <span className="block text-[10px] text-muted-foreground">
                                Carga
                              </span>
                              <span className="font-bold text-foreground">
                                {serie.peso_kg} kg
                              </span>
                            </div>
                            <div className="rounded bg-background/80 p-1.5 text-center">
                              <span className="block text-[10px] text-muted-foreground">
                                Reps
                              </span>
                              <span className="font-bold text-foreground">
                                {serie.reps_hechas}
                              </span>
                            </div>
                            <div className="rounded bg-background/80 p-1.5 text-center">
                              <span className="block text-[10px] text-muted-foreground">
                                RPE Real
                              </span>
                              <span className="font-bold text-primary">
                                @{serie.rpe_real ?? "N/A"}
                              </span>
                            </div>
                            <div className="rounded bg-background/80 p-1.5 text-center">
                              <span className="block text-[10px] text-muted-foreground">
                                1RM Est.
                              </span>
                              <span className="font-bold text-foreground">
                                {epley1rm.toFixed(0)} kg
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Volumen serie: {volumenSerie} kg</span>
                            <span>Brzycki 1RM: {brzycki1rm.toFixed(1)} kg</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <Button
            variant="secondary"
            size="touch"
            className="w-full text-xs font-semibold"
            onClick={onClose}
          >
            Entendido, volver a rutina
          </Button>
        </div>
      </div>
    </div>
  );
}
