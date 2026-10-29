"use client";

import * as React from "react";
import type { Perfil } from "@/types/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PLANTILLAS_GENERICAS,
  type PlantillaGenerica,
} from "@/services/plantillas-genericas";

export interface AssignRoutinePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  alumno: Perfil | null;
  onConfirmAssign: (alumnoId: string, plantillaId: string) => Promise<void>;
  plantillas?: PlantillaGenerica[];
}

/**
 * Modal de Previsualización y Confirmación de Rutinas Genéricas (GOZS-245).
 * Criterios de Aceptación:
 * - GIVEN un alumno sin rutina
 * - WHEN toca Asignar rutina (rayito)
 * - THEN se abre un preview con las rutinas genéricas, el coach elige una,
 *   se muestra confirmación y recién entonces se asigna.
 */
export function AssignRoutinePreviewModal({
  isOpen,
  onClose,
  alumno,
  onConfirmAssign,
  plantillas = PLANTILLAS_GENERICAS,
}: AssignRoutinePreviewModalProps) {
  const [selectedPlantillaId, setSelectedPlantillaId] = React.useState<string>(
    plantillas[0]?.id || "",
  );
  const [showConfirmation, setShowConfirmation] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorAsignacion, setErrorAsignacion] = React.useState<string | null>(null);

  // Sincronizar selección inicial al abrir el modal
  React.useEffect(() => {
    if (isOpen) {
      setSelectedPlantillaId(plantillas[0]?.id || "");
      setShowConfirmation(false);
      setIsSubmitting(false);
      setErrorAsignacion(null);
    }
  }, [isOpen, plantillas]);

  const plantillaSeleccionada =
    plantillas.find((p) => p.id === selectedPlantillaId) || plantillas[0] || PLANTILLAS_GENERICAS[0]!;

  if (!isOpen || !alumno || !plantillaSeleccionada) return null;

  const handleProcederConfirmacion = () => {
    setShowConfirmation(true);
  };

  const handleVolverAlPreview = () => {
    setShowConfirmation(false);
  };

  const handleEjecutarAsignacion = async () => {
    if (!plantillaSeleccionada) return;
    setIsSubmitting(true);
    setErrorAsignacion(null);
    try {
      await onConfirmAssign(alumno.id, plantillaSeleccionada.id);
      onClose();
    } catch (err) {
      setErrorAsignacion(
        err instanceof Error ? err.message : "No pudimos asignar la rutina. Intenta de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-routine-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm transition-opacity"
    >
      <div className="flex w-full max-w-2xl flex-col max-h-[92vh] rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card/80 p-4 sm:p-5">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">
                ⚡
              </span>
              <h2
                id="assign-routine-preview-title"
                className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate"
              >
                Asignar Rutina a {alumno.nombre_completo}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Previsualizá y elegí entre las plantillas genéricas antes de confirmar la asignación.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar modal de previsualización"
            className="min-h-11 min-w-11 rounded-full text-muted-foreground hover:text-foreground"
          >
            ✕
          </Button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {!showConfirmation ? (
            /* PASO 1: SELECCIÓN Y PREVIEW DE RUTINAS GENÉRICAS */
            <div className="space-y-5" data-testid="seccion-preview-rutinas">
              {/* Selector de Plantillas Genéricas */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  Plantillas Genéricas Disponibles ({plantillas.length})
                </label>
                <div className="grid gap-2 sm:grid-cols-1">
                  {plantillas.map((plantilla) => {
                    const isSelected = plantilla.id === selectedPlantillaId;
                    return (
                      <button
                        key={plantilla.id}
                        type="button"
                        onClick={() => setSelectedPlantillaId(plantilla.id)}
                        data-testid={`opcion-plantilla-${plantilla.id}`}
                        className={`flex items-start justify-between rounded-xl border p-3.5 text-left transition-all min-h-11 ${
                          isSelected
                            ? "border-amber-500 bg-amber-500/10 shadow-sm"
                            : "border-border bg-background/50 hover:border-border/80 hover:bg-accent/40"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-foreground">
                              {plantilla.nombre}
                            </span>
                            <Badge variant="warning" className="text-[10px] py-0 px-2">
                              {plantilla.categoria}
                            </Badge>
                            {isSelected && (
                              <span className="inline-flex items-center text-[11px] font-semibold text-amber-500 dark:text-amber-400">
                                ✓ Seleccionada
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {plantilla.descripcion}
                          </p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <div
                            className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? "border-amber-500 bg-amber-500"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {isSelected && (
                              <div className="h-1.5 w-1.5 rounded-full bg-black" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Caja de Previsualización Quirúrgica de la Rutina */}
              {plantillaSeleccionada && (
                <div
                  className="rounded-xl border border-border bg-background/60 p-4 sm:p-5 shadow-xs space-y-4"
                  data-testid="preview-rutina-generica"
                >
                  <div className="border-b border-border/60 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400">
                        Previsualización de la Rutina
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {plantillaSeleccionada.dias.length} Día(s) ·{" "}
                        {plantillaSeleccionada.dias.reduce(
                          (acc, d) => acc + d.ejercicios.length,
                          0,
                        )}{" "}
                        Ejercicios
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-bold text-foreground">
                      {plantillaSeleccionada.nombre}
                    </h3>
                    {plantillaSeleccionada.comentarios && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        "{plantillaSeleccionada.comentarios}"
                      </p>
                    )}
                  </div>

                  {/* Detalle de Días y Ejercicios */}
                  <div className="space-y-4">
                    {plantillaSeleccionada.dias.map((dia) => (
                      <div
                        key={dia.id}
                        className="rounded-lg border border-border/70 bg-card p-3 sm:p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            {dia.nombre}
                          </h4>
                          <span className="text-[11px] text-muted-foreground">
                            {dia.ejercicios.length} ejercicios
                          </span>
                        </div>

                        <div className="divide-y divide-border/40">
                          {dia.ejercicios.map((ej) => (
                            <div
                              key={ej.orden}
                              className="py-2.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-secondary text-[11px] font-bold text-muted-foreground">
                                  {ej.orden}
                                </span>
                                <div className="min-w-0">
                                  <span className="font-semibold text-foreground">
                                    {ej.nombre}
                                  </span>
                                  {ej.notas && (
                                    <p className="text-[11px] text-muted-foreground">
                                      {ej.notas}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pl-7 sm:pl-0 shrink-0 text-muted-foreground">
                                <span className="font-mono font-medium text-foreground">
                                  {ej.series} × {ej.repeticiones}
                                </span>
                                <span>·</span>
                                <span>{ej.descanso_segundos}s desc.</span>
                                {ej.rpe_objetivo && (
                                  <>
                                    <span>·</span>
                                    <span className="rounded bg-secondary/80 px-1 py-0.5 font-mono text-[10px] text-foreground">
                                      RPE {ej.rpe_objetivo}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* PASO 2: CONFIRMACIÓN EXPLÍCITA ANTES DE ASIGNAR */
            <div
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 sm:p-6 text-center space-y-4"
              data-testid="seccion-confirmacion-asignacion"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-2xl">
                ⚠️
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-bold text-foreground">
                  ¿Confirmar asignación de rutina?
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                  Estás a punto de asignar la rutina genérica a{" "}
                  <strong className="text-foreground">{alumno.nombre_completo}</strong>.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-3.5 text-left space-y-1.5 max-w-md mx-auto">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Atleta:</span>
                  <span className="font-semibold text-foreground">{alumno.nombre_completo}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Rutina a clonar:</span>
                  <span className="font-semibold text-foreground">{plantillaSeleccionada.nombre}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Estado resultante:</span>
                  <Badge variant="success" className="text-[10px] py-0">ACTIVO</Badge>
                </div>
                <div className="pt-2 text-[11px] text-muted-foreground border-t border-border/50">
                  ℹ️ Esta rutina se clonará de forma independiente para el atleta. Podrás ajustarla luego según su evolución.
                </div>
              </div>
            </div>
          )}
        </div>

        {errorAsignacion && (
          <p role="alert" className="border-t border-border px-4 py-2 text-sm text-rose-300 sm:px-5">
            {errorAsignacion}
          </p>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border bg-card/80 p-4 sm:p-5">
          {!showConfirmation ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                data-testid="btn-cancelar-preview"
                className="min-h-11 min-w-[90px] text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleProcederConfirmacion}
                data-testid="btn-continuar-confirmacion"
                className="min-h-11 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-black active:scale-95 px-4"
              >
                Elegir esta rutina →
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={handleVolverAlPreview}
                data-testid="btn-volver-preview"
                className="min-h-11 min-w-[90px] text-xs"
              >
                ← Volver al Preview
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isSubmitting}
                onClick={handleEjecutarAsignacion}
                data-testid="btn-confirmar-asignacion"
                className="min-h-11 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black active:scale-95 px-5 shadow-sm"
              >
                {isSubmitting ? "Asignando rutina..." : "Confirmar y Asignar"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
