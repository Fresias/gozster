"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { calculateBrzycki1RM } from "@/lib/strength-metrics";

export function LiveWorkout() {
  const {
    currentSession,
    updateSetField,
    completeSet,
    uncompleteSet,
    setMembershipStatus,
    resetSessionToDefaults,
  } = useAthleteStore();

  const { isOnline, pendingEvents, clearQueue } = useOfflineQueueStore();
  const [syncSuccessMessage, setSyncSuccessMessage] = React.useState<string | null>(
    null,
  );

  const totalSets = currentSession.ejercicios.reduce(
    (acc, ej) => acc + ej.series.length,
    0,
  );

  const completedSetsCount = currentSession.ejercicios.reduce(
    (acc, ej) => acc + ej.series.filter((s) => s.completada).length,
    0,
  );

  const totalVolumeKg = currentSession.ejercicios.reduce((acc, ej) => {
    return (
      acc +
      ej.series.reduce((setAcc, s) => {
        if (!s.completada) return setAcc;
        return setAcc + s.peso_kg * s.reps_hechas;
      }, 0)
    );
  }, 0);

  const handleSyncQueue = () => {
    if (pendingEvents.length === 0) return;
    const count = pendingEvents.length;
    // En un flujo real, aquí se enviarían los eventos a Supabase vía RPC / batch insert
    clearQueue();
    setSyncSuccessMessage(`¡${count} eventos sincronizados con éxito!`);
    setTimeout(() => setSyncSuccessMessage(null), 3000);
  };

  return (
    <div className="space-y-6 pb-28" data-testid="live-workout-container">
      {/* Encabezado de Sesión */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Entrenamiento en Vivo
          </span>

          <Button
            variant="outline"
            size="sm"
            className="text-xs text-muted-foreground hover:text-amber-400"
            onClick={() => setMembershipStatus("EXPIRED_PAYMENT_PENDING")}
            data-testid="simulate-paywall-btn"
          >
            Simular Cuota Vencida
          </Button>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {currentSession.nombre_rutina}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fecha: {currentSession.fecha} • Objetivo: Hipertrofia &amp; Fuerza
          </p>
        </div>

        {/* Métricas en vivo de la sesión */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Series Hechas</p>
            <p className="text-lg font-bold text-foreground">
              {completedSetsCount} / {totalSets}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Volumen Total</p>
            <p className="text-lg font-bold text-primary">
              {totalVolumeKg.toLocaleString()} kg
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Cola Offline</p>
            <p className="text-lg font-bold text-foreground">
              {pendingEvents.length} pendientes
            </p>
          </div>
        </div>

        {/* Notificación de sincronización */}
        {syncSuccessMessage && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary font-medium">
            {syncSuccessMessage}
          </div>
        )}

        {/* Acciones de sincronización offline */}
        {pendingEvents.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1 text-xs font-semibold"
              onClick={handleSyncQueue}
              disabled={!isOnline}
            >
              {isOnline
                ? `Sincronizar Cola (${pendingEvents.length} eventos)`
                : `Esperando Conexión (${pendingEvents.length} guardados offline)`}
            </Button>
          </div>
        )}
      </div>

      {/* Lista de Ejercicios */}
      <div className="space-y-5">
        {currentSession.ejercicios.map((ejercicio, ejIndex) => (
          <Card key={ejercicio.id} className="border-border overflow-hidden">
            <CardHeader className="p-4 bg-secondary/30 border-b border-border">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Ejercicio #{ejIndex + 1}
                  </span>
                  <CardTitle className="text-base sm:text-lg font-bold mt-0.5">
                    {ejercicio.nombre}
                  </CardTitle>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs font-mono font-medium text-primary">
                    ⏱️ {ejercicio.descanso_segundos}s
                  </span>
                </div>
              </div>

              <CardDescription className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
                <span className="font-medium text-foreground">
                  Objetivo: {ejercicio.series.length} series × {ejercicio.repeticiones_objetivo} reps (RPE ~{ejercicio.rpe_objetivo})
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {ejercicio.musculos_principales.join(", ")}
                </span>
              </CardDescription>
            </CardHeader>

            <CardContent className="p-3 sm:p-4 space-y-4">
              {ejercicio.series.map((serie) => {
                const brzycki1RM = calculateBrzycki1RM(
                  serie.peso_kg,
                  serie.reps_hechas,
                );

                return (
                  <div
                    key={serie.numero_serie}
                    className={`rounded-xl border p-3 transition-colors ${
                      serie.completada
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-card"
                    }`}
                    data-testid={`set-row-${ejercicio.id}-${serie.numero_serie}`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            serie.completada
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {serie.numero_serie}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          Serie {serie.numero_serie}
                        </span>
                      </div>

                      {/* Estimación de 1RM en vivo */}
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">
                          1RM Estimado (Epley)
                        </span>
                        <span className="text-xs font-mono font-bold text-primary">
                          {serie.estimated1RM.toFixed(1)} kg
                        </span>
                        {brzycki1RM > 0 && (
                          <span className="text-[9px] text-muted-foreground block font-mono">
                            Brzycki: {brzycki1RM.toFixed(1)} kg
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Controles de Carga: Peso, Reps, RPE con botones táctiles grandes */}
                    <div className="grid grid-cols-3 gap-2 py-1">
                      {/* Peso (kg) */}
                      <div className="space-y-1">
                        <label
                          htmlFor={`peso-${ejercicio.id}-${serie.numero_serie}`}
                          className="text-[11px] font-medium text-muted-foreground block"
                        >
                          Peso (kg)
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            id={`peso-${ejercicio.id}-${serie.numero_serie}`}
                            type="number"
                            step="2.5"
                            min="0"
                            value={serie.peso_kg}
                            onChange={(e) =>
                              updateSetField(
                                ejercicio.id,
                                serie.numero_serie,
                                "peso_kg",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            disabled={serie.completada}
                            className="w-full rounded-md border border-input bg-background px-2 py-2 text-center text-sm font-semibold tabular-nums text-foreground disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="flex gap-1 pt-0.5">
                          <button
                            type="button"
                            disabled={serie.completada || serie.peso_kg <= 2.5}
                            onClick={() =>
                              updateSetField(
                                ejercicio.id,
                                serie.numero_serie,
                                "peso_kg",
                                Math.max(0, serie.peso_kg - 2.5),
                              )
                            }
                            className="flex-1 rounded bg-secondary py-1 text-[10px] font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-30 touch-manipulation"
                          >
                            -2.5
                          </button>
                          <button
                            type="button"
                            disabled={serie.completada}
                            onClick={() =>
                              updateSetField(
                                ejercicio.id,
                                serie.numero_serie,
                                "peso_kg",
                                serie.peso_kg + 2.5,
                              )
                            }
                            className="flex-1 rounded bg-secondary py-1 text-[10px] font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-30 touch-manipulation"
                          >
                            +2.5
                          </button>
                        </div>
                      </div>

                      {/* Repeticiones */}
                      <div className="space-y-1">
                        <label
                          htmlFor={`reps-${ejercicio.id}-${serie.numero_serie}`}
                          className="text-[11px] font-medium text-muted-foreground block"
                        >
                          Reps
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            id={`reps-${ejercicio.id}-${serie.numero_serie}`}
                            type="number"
                            step="1"
                            min="0"
                            value={serie.reps_hechas}
                            onChange={(e) =>
                              updateSetField(
                                ejercicio.id,
                                serie.numero_serie,
                                "reps_hechas",
                                parseInt(e.target.value, 10) || 0,
                              )
                            }
                            disabled={serie.completada}
                            className="w-full rounded-md border border-input bg-background px-2 py-2 text-center text-sm font-semibold tabular-nums text-foreground disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="flex gap-1 pt-0.5">
                          <button
                            type="button"
                            disabled={serie.completada || serie.reps_hechas <= 1}
                            onClick={() =>
                              updateSetField(
                                ejercicio.id,
                                serie.numero_serie,
                                "reps_hechas",
                                Math.max(0, serie.reps_hechas - 1),
                              )
                            }
                            className="flex-1 rounded bg-secondary py-1 text-[10px] font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-30 touch-manipulation"
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            disabled={serie.completada}
                            onClick={() =>
                              updateSetField(
                                ejercicio.id,
                                serie.numero_serie,
                                "reps_hechas",
                                serie.reps_hechas + 1,
                              )
                            }
                            className="flex-1 rounded bg-secondary py-1 text-[10px] font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-30 touch-manipulation"
                          >
                            +1
                          </button>
                        </div>
                      </div>

                      {/* RPE */}
                      <div className="space-y-1">
                        <label
                          htmlFor={`rpe-${ejercicio.id}-${serie.numero_serie}`}
                          className="text-[11px] font-medium text-muted-foreground block"
                        >
                          RPE (Esfuerzo)
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            id={`rpe-${ejercicio.id}-${serie.numero_serie}`}
                            type="number"
                            step="0.5"
                            min="1"
                            max="10"
                            value={serie.rpe_real}
                            onChange={(e) =>
                              updateSetField(
                                ejercicio.id,
                                serie.numero_serie,
                                "rpe_real",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            disabled={serie.completada}
                            className="w-full rounded-md border border-input bg-background px-2 py-2 text-center text-sm font-semibold tabular-nums text-foreground disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="flex gap-1 pt-0.5">
                          <button
                            type="button"
                            disabled={serie.completada || serie.rpe_real <= 6}
                            onClick={() =>
                              updateSetField(
                                ejercicio.id,
                                serie.numero_serie,
                                "rpe_real",
                                Math.max(1, serie.rpe_real - 0.5),
                              )
                            }
                            className="flex-1 rounded bg-secondary py-1 text-[10px] font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-30 touch-manipulation"
                          >
                            -0.5
                          </button>
                          <button
                            type="button"
                            disabled={serie.completada || serie.rpe_real >= 10}
                            onClick={() =>
                              updateSetField(
                                ejercicio.id,
                                serie.numero_serie,
                                "rpe_real",
                                Math.min(10, serie.rpe_real + 0.5),
                              )
                            }
                            className="flex-1 rounded bg-secondary py-1 text-[10px] font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-30 touch-manipulation"
                          >
                            +0.5
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Botón táctil ergonómico grande de acción */}
                    <div className="pt-2">
                      {serie.completada ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                            <span>✓</span>
                            <span>Completada ({serie.peso_kg}kg × {serie.reps_hechas} @RPE {serie.rpe_real})</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[11px] text-muted-foreground hover:text-destructive h-8 px-2"
                            onClick={() => uncompleteSet(ejercicio.id, serie.numero_serie)}
                          >
                            Deshacer
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="touch"
                          className="w-full bg-primary font-bold tracking-wide text-primary-foreground shadow-md hover:opacity-90 active:scale-[0.98] touch-manipulation"
                          onClick={() => completeSet(ejercicio.id, serie.numero_serie)}
                          data-testid={`complete-set-btn-${ejercicio.id}-${serie.numero_serie}`}
                        >
                          ✓ Marcar Serie Hecha ({ejercicio.descanso_segundos}s Descanso)
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Botón para reiniciar rutina al estado inicial */}
      <div className="pt-2 text-center">
        <Button
          variant="outline"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={resetSessionToDefaults}
        >
          Reiniciar Rutina a Valores por Defecto
        </Button>
      </div>
    </div>
  );
}
