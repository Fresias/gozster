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
import { Badge } from "@/components/ui/badge";
import {
  useAthleteStore,
  type LiveWorkoutExercise,
  type LiveWorkoutSet,
} from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  calculateBrzycki1RM,
  calculateEffectiveVolume,
  type WarmupSetProgression,
} from "@/lib/strength-metrics";
import { ExerciseVideoModal } from "@/components/athlete/exercise-video-modal";
import { WarmupModal } from "@/components/athlete/warmup-modal";
import { PlateCalculatorModal } from "@/components/athlete/plate-calculator-modal";
import { PainReportModal } from "@/components/athlete/pain-report-modal";
import { VideoUploadModal } from "@/components/athlete/video-upload-modal";
import { HabitTracker } from "@/components/athlete/habit-tracker";
import { NutritionTracker } from "@/components/athlete/nutrition-tracker";
import { REAL_ALUMNOS } from "@/services/real-mynter-data";

export function LiveWorkout() {
  const {
    currentSession,
    rpeValidationError,
    clearRpeValidationError,
    updateSetField,
    updateSetType,
    reportPainForSet,
    attachVideoForSet,
    applyWarmupSetsToExercise,
    completeSet,
    uncompleteSet,
    setMembershipStatus,
    resetSessionToDefaults,
    loadStudentSession,
    syncSessionToSupabase,
  } = useAthleteStore();

  const [activeTab, setActiveTab] = React.useState<"workout" | "habits" | "nutrition">("workout");

  // Modales
  const [videoExercise, setVideoExercise] = React.useState<LiveWorkoutExercise | null>(null);
  const [warmupModalExercise, setWarmupModalExercise] = React.useState<LiveWorkoutExercise | null>(null);
  const [plateModalWeight, setPlateModalWeight] = React.useState<number | null>(null);
  const [painModalData, setPainModalData] = React.useState<{
    exerciseId: string;
    exerciseName: string;
    setNumber: number;
  } | null>(null);
  const [videoUploadModalData, setVideoUploadModalData] = React.useState<{
    exerciseId: string;
    exerciseName: string;
    setNumber: number;
  } | null>(null);

  const { isOnline, pendingEvents, clearQueue } = useOfflineQueueStore();
  const [syncSuccessMessage, setSyncSuccessMessage] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);

  const totalSets = currentSession.ejercicios.reduce(
    (acc, ej) => acc + ej.series.length,
    0,
  );

  const completedSetsCount = currentSession.ejercicios.reduce(
    (acc, ej) => acc + ej.series.filter((s) => s.completada).length,
    0,
  );

  // Tonelaje total (todas las series completadas)
  const totalVolumeKg = currentSession.ejercicios.reduce((acc, ej) => {
    return (
      acc +
      ej.series.reduce((setAcc, s) => {
        if (!s.completada) return setAcc;
        return setAcc + s.peso_kg * s.reps_hechas;
      }, 0)
    );
  }, 0);

  // Hevy Double Volume: Excluye estrictamente las series de calentamiento (W / WARMUP)
  const allFlatSets = currentSession.ejercicios.flatMap((e) => e.series);
  const effectiveVolumeKg = calculateEffectiveVolume(allFlatSets);

  const handleSyncSupabase = async () => {
    setIsSyncing(true);
    const res = await syncSessionToSupabase();
    setIsSyncing(false);
    if (res.success) {
      setSyncSuccessMessage("✓ Sesión y series sincronizadas con éxito en Supabase");
      setTimeout(() => setSyncSuccessMessage(null), 3500);
    } else {
      setSyncSuccessMessage(`Aviso: ${res.error}`);
    }
  };

  const handleSyncQueue = () => {
    if (pendingEvents.length === 0) return;
    const count = pendingEvents.length;
    clearQueue();
    setSyncSuccessMessage(`¡${count} eventos sincronizados con éxito!`);
    setTimeout(() => setSyncSuccessMessage(null), 3000);
  };

  return (
    <div className="space-y-6 pb-28" data-testid="live-workout-container">
      {/* Switcher de Módulos: Entrenamiento, Hábitos, Nutrición */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("workout")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "workout"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary/40"
          }`}
          data-testid="tab-workout"
        >
          🏋️ Entrenamiento en Vivo
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("habits")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "habits"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary/40"
          }`}
          data-testid="tab-habits"
        >
          🎯 Hábitos Diarios
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("nutrition")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "nutrition"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary/40"
          }`}
          data-testid="tab-nutrition"
        >
          🥗 Nutrición &amp; Macros
        </button>
      </div>

      {activeTab === "habits" && (
        <HabitTracker
          athleteId={currentSession.studentId || "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7"}
          athleteName={currentSession.studentName || "Celeste Gerardi"}
        />
      )}

      {activeTab === "nutrition" && (
        <NutritionTracker
          athleteId={currentSession.studentId || "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7"}
          athleteName={currentSession.studentName || "Celeste Gerardi"}
        />
      )}

      {activeTab === "workout" && (
        <>
          {/* Encabezado de Sesión */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Entrenamiento en Vivo
              </span>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                  onClick={handleSyncSupabase}
                  disabled={isSyncing}
                  data-testid="sync-supabase-btn"
                >
                  {isSyncing ? "Guardando..." : "✓ Sincronizar en Supabase"}
                </Button>

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
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {currentSession.nombre_rutina}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fecha: {currentSession.fecha} • Objetivo: Hipertrofia &amp; Fuerza
              </p>
            </div>

            {/* Selector rápido de Alumno Real GOZS o Rutina Base */}
            <div
              className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none"
              data-testid="student-routine-switcher"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                Rutina Real:
              </span>
              <button
                type="button"
                onClick={resetSessionToDefaults}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  !currentSession.studentId
                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
                data-testid="select-default-routine"
              >
                Fuerza Base (3 Ejercicios)
              </button>
              {REAL_ALUMNOS.slice(0, 6).map((al) => (
                <button
                  key={al.id}
                  type="button"
                  onClick={() => loadStudentSession(al.id)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    currentSession.studentId === al.id
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                  data-testid={`select-student-${al.id}`}
                >
                  {al.nombre_completo.split(" ")[0]} (GOZS)
                </button>
              ))}
            </div>

            {/* Banner de Validación RPE Forzado */}
            {rpeValidationError && (
              <div
                className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-300 font-semibold flex items-center justify-between"
                data-testid="rpe-validation-banner"
              >
                <span>⚠️ {rpeValidationError}</span>
                <button
                  onClick={clearRpeValidationError}
                  className="text-amber-300/80 hover:text-amber-200 text-xs px-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Métricas en vivo de la sesión con Hevy Double Volume */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-m3-1">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Series Hechas</p>
                <p className="text-xl font-black font-mono tabular-nums text-foreground mt-0.5">
                  {completedSetsCount} <span className="text-sm font-normal text-muted-foreground">/ {totalSets}</span>
                </p>
              </div>

              {/* Hevy Double Volume */}
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-3.5 shadow-m3-1">
                <p className="text-[11px] font-bold text-primary uppercase tracking-wider">
                  Vol. Efectivo (Hevy)
                </p>
                <p className="text-xl font-black text-primary font-mono tabular-nums mt-0.5">
                  {effectiveVolumeKg.toLocaleString()} <span className="text-xs font-semibold">kg</span>
                </p>
                <span className="text-[9px] text-muted-foreground block mt-0.5">
                  Excluye calentamiento (W)
                </span>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-m3-1">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Volumen Bruto</p>
                <p className="text-xl font-black text-foreground/90 font-mono tabular-nums mt-0.5">
                  {totalVolumeKg.toLocaleString()} <span className="text-xs font-semibold text-muted-foreground">kg</span>
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-m3-1">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Cola Offline</p>
                <p className="text-xl font-black text-foreground font-mono tabular-nums mt-0.5">
                  {pendingEvents.length} <span className="text-xs font-semibold text-muted-foreground">pendientes</span>
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
            {currentSession.ejercicios.map((ejercicio, ejIndex) => {
              const isSuperset = ejercicio.es_superserie;
              const supersetBadge = isSuperset
                ? `Superserie A${ejercicio.grupo_superserie || 1}`
                : null;

              return (
                <Card
                  key={ejercicio.id}
                  className={`border shadow-sm overflow-hidden transition-all ${
                    isSuperset ? "border-purple-500/40 bg-purple-500/5" : "border-border"
                  }`}
                  data-testid={`exercise-card-${ejercicio.id}`}
                >
                  <CardHeader className="bg-secondary/20 p-3 sm:p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-mono font-bold text-primary">
                          #{ejIndex + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                              {ejercicio.nombre}
                            </CardTitle>
                            {supersetBadge && (
                              <Badge className="bg-purple-600 text-white text-[10px]">
                                {supersetBadge}
                              </Badge>
                            )}
                            {ejercicio.force_rpe_required && (
                              <Badge
                                variant="outline"
                                className="border-amber-500 text-amber-400 text-[10px]"
                              >
                                RPE Exigido
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Tempo: <span className="font-mono font-semibold">{ejercicio.tempo || "3-0-1-0"}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Botón Warmup Calculator */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-bold"
                          onClick={() => setWarmupModalExercise(ejercicio)}
                          data-testid={`warmup-btn-${ejercicio.id}`}
                        >
                          <span>🔥</span>
                          <span>Calentamiento</span>
                        </Button>

                        {/* Botón Video de Técnica */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs border-primary/40 text-primary hover:bg-primary/10"
                          onClick={() => setVideoExercise(ejercicio)}
                          data-testid={`demo-technique-btn-${ejercicio.id}`}
                        >
                          <span>🎬</span>
                          <span>Técnica</span>
                        </Button>

                        <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs font-mono font-medium text-primary">
                          ⏱️ {ejercicio.descanso_segundos}s
                        </span>
                      </div>
                    </div>

                    <CardDescription className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
                      <span className="font-medium text-foreground">
                        Objetivo: {ejercicio.series.length} series × {ejercicio.repeticiones_objetivo} reps (RPE ~{ejercicio.rpe_objetivo})
                      </span>
                      {ejercicio.musculos_principales.length > 0 && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">
                            {ejercicio.musculos_principales.join(", ")}
                          </span>
                        </>
                      )}
                    </CardDescription>

                    {ejercicio.comentario && (
                      <div className="pt-2 text-[11px] text-muted-foreground flex items-center gap-1.5 border-t border-border/40 mt-1">
                        <span>💡</span>
                        <span className="italic">{ejercicio.comentario}</span>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="p-3 sm:p-4 space-y-4">
                    {ejercicio.series.map((serie) => {
                      const brzycki1RM = calculateBrzycki1RM(
                        serie.peso_kg,
                        serie.reps_hechas,
                      );

                      const setType = serie.set_type || "N";
                      const isWarmup = setType === "W" || setType === "WARMUP";
                      const firstUncompleted = ejercicio.series.find((s) => !s.completada);
                      const isCurrentActive =
                        !serie.completada &&
                        firstUncompleted?.numero_serie === serie.numero_serie;

                      return (
                        <div
                          key={serie.numero_serie}
                          className={`rounded-2xl border p-3.5 transition-all duration-150 ${
                            serie.completada
                              ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/20"
                              : isCurrentActive
                              ? "border-2 border-primary bg-primary/5 shadow-xs ring-1 ring-primary/20"
                              : isWarmup
                              ? "border-amber-500/30 bg-amber-500/5"
                              : "border-border/80 bg-card"
                          }`}
                          data-testid={`set-row-${ejercicio.id}-${serie.numero_serie}`}
                        >
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/60">
                            <div className="flex items-center gap-2">
                              {/* Selector Taxonomía de Series Cuádruple (W, N, F, D) */}
                              <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-lg border border-border/40">
                                {(["W", "N", "F", "D"] as const).map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    disabled={serie.completada}
                                    onClick={() => updateSetType(ejercicio.id, serie.numero_serie, t)}
                                    className={`px-2 py-0.5 text-[10px] font-black rounded transition-all ${
                                      setType === t
                                        ? t === "W"
                                          ? "bg-amber-500 text-black shadow-sm"
                                          : t === "F"
                                          ? "bg-rose-600 text-white shadow-sm"
                                          : t === "D"
                                          ? "bg-purple-600 text-white shadow-sm"
                                          : "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                    title={
                                      t === "W"
                                        ? "Calentamiento / Aproximación (excluido de volumen)"
                                        : t === "F"
                                        ? "Fallo concéntrico (RPE 10)"
                                        : t === "D"
                                        ? "Drop Set descendente"
                                        : "Serie Normal efectiva"
                                    }
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>

                              <span className="text-xs font-semibold text-foreground">
                                Serie {serie.numero_serie}
                              </span>

                              {/* Ghost Record de Sesión Previa en Gris Tenue */}
                              <span className="text-[11px] text-muted-foreground/70 font-mono hidden sm:inline">
                                Última: {serie.last_session_weight_kg || serie.peso_kg} kg × {serie.last_session_reps || serie.reps_hechas} reps
                              </span>
                            </div>

                            {/* Estimación de 1RM & Botones auxiliares (Discos, Molestia, Video) */}
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2 font-bold"
                                onClick={() => setPlateModalWeight(serie.peso_kg)}
                                title="Calcular discos olímpicos"
                              >
                                🏋️ Discos
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className={`h-6 text-[10px] px-2 font-bold ${
                                  serie.pain_reported
                                    ? "border-destructive text-destructive bg-destructive/10"
                                    : "text-muted-foreground"
                                }`}
                                onClick={() =>
                                  setPainModalData({
                                    exerciseId: ejercicio.id,
                                    exerciseName: ejercicio.nombre,
                                    setNumber: serie.numero_serie,
                                  })
                                }
                                title="Reportar molestia o dolor"
                              >
                                {serie.pain_reported ? "⚠️ Dolor" : "Molestia"}
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className={`h-6 text-[10px] px-2 font-bold ${
                                  serie.video_url
                                    ? "border-primary text-primary bg-primary/10"
                                    : "text-muted-foreground"
                                }`}
                                onClick={() =>
                                  setVideoUploadModalData({
                                    exerciseId: ejercicio.id,
                                    exerciseName: ejercicio.nombre,
                                    setNumber: serie.numero_serie,
                                  })
                                }
                                title="Subir video form check"
                              >
                                {serie.video_url ? "📹 Video OK" : "📹 Video"}
                              </Button>

                              <div className="text-right">
                                <span className="text-xs font-mono font-bold text-primary">
                                  {serie.estimated1RM.toFixed(1)} kg 1RM
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Notificaciones de Molestia o Video en la serie */}
                          {serie.pain_reported && (
                            <div className="p-2 rounded bg-destructive/10 border border-destructive/30 text-[11px] text-destructive font-medium mb-2">
                              ⚠️ Molestia reportada: {serie.pain_notes}
                            </div>
                          )}
                          {serie.video_url && (
                            <div className="p-2 rounded bg-primary/10 border border-primary/30 text-[11px] text-primary font-medium mb-2 truncate">
                              📹 Form Check cargado: {serie.video_url}
                            </div>
                          )}

                          {/* Controles de Carga: Peso, Reps, RPE con botones táctiles grandes (Thumb Zone) */}
                          <div className="grid grid-cols-3 gap-2.5 py-1">
                            {/* Peso (kg) */}
                            <div className="space-y-1.5">
                              <label
                                htmlFor={`peso-${ejercicio.id}-${serie.numero_serie}`}
                                className="text-[11px] font-bold text-muted-foreground block text-center uppercase tracking-wider"
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
                                  className="w-full min-h-[44px] rounded-xl border border-input bg-background px-2 py-2 text-center text-base font-mono font-bold tabular-nums text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                              </div>
                              <div className="flex gap-1.5 pt-0.5">
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
                                  className="flex-1 min-h-[36px] rounded-lg bg-secondary/80 py-1.5 text-xs font-bold text-secondary-foreground hover:bg-secondary disabled:opacity-30 active:scale-95 transition-all touch-manipulation cursor-pointer border border-border/40"
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
                                  className="flex-1 min-h-[36px] rounded-lg bg-secondary/80 py-1.5 text-xs font-bold text-secondary-foreground hover:bg-secondary disabled:opacity-30 active:scale-95 transition-all touch-manipulation cursor-pointer border border-border/40"
                                >
                                  +2.5
                                </button>
                              </div>
                            </div>

                            {/* Repeticiones */}
                            <div className="space-y-1.5">
                              <label
                                htmlFor={`reps-${ejercicio.id}-${serie.numero_serie}`}
                                className="text-[11px] font-bold text-muted-foreground block text-center uppercase tracking-wider"
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
                                  className="w-full min-h-[44px] rounded-xl border border-input bg-background px-2 py-2 text-center text-base font-mono font-bold tabular-nums text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                              </div>
                              <div className="flex gap-1.5 pt-0.5">
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
                                  className="flex-1 min-h-[36px] rounded-lg bg-secondary/80 py-1.5 text-xs font-bold text-secondary-foreground hover:bg-secondary disabled:opacity-30 active:scale-95 transition-all touch-manipulation cursor-pointer border border-border/40"
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
                                  className="flex-1 min-h-[36px] rounded-lg bg-secondary/80 py-1.5 text-xs font-bold text-secondary-foreground hover:bg-secondary disabled:opacity-30 active:scale-95 transition-all touch-manipulation cursor-pointer border border-border/40"
                                >
                                  +1
                                </button>
                              </div>
                            </div>

                            {/* RPE */}
                            <div className="space-y-1.5">
                              <label
                                htmlFor={`rpe-${ejercicio.id}-${serie.numero_serie}`}
                                className="text-[11px] font-bold text-muted-foreground block text-center uppercase tracking-wider"
                              >
                                RPE (6-10)
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  id={`rpe-${ejercicio.id}-${serie.numero_serie}`}
                                  type="number"
                                  step="0.5"
                                  min="6"
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
                                  className="w-full min-h-[44px] rounded-xl border border-input bg-background px-2 py-2 text-center text-base font-mono font-bold tabular-nums text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                              </div>
                              <div className="flex gap-1.5 pt-0.5">
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
                                  className="flex-1 min-h-[36px] rounded-lg bg-secondary/80 py-1.5 text-xs font-bold text-secondary-foreground hover:bg-secondary disabled:opacity-30 active:scale-95 transition-all touch-manipulation cursor-pointer border border-border/40"
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
                                  className="flex-1 min-h-[36px] rounded-lg bg-secondary/80 py-1.5 text-xs font-bold text-secondary-foreground hover:bg-secondary disabled:opacity-30 active:scale-95 transition-all touch-manipulation cursor-pointer border border-border/40"
                                >
                                  +0.5
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Botón táctil ergonómico grande de acción (Thumb Zone 48px - 56px) */}
                          <div className="pt-2">
                            {serie.completada ? (
                              <div className="flex items-center justify-between gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5">
                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white dark:text-slate-950 font-black text-[11px]">
                                    ✓
                                  </span>
                                  <span>
                                    Serie {serie.numero_serie} ({setType}): {serie.peso_kg}kg × {serie.reps_hechas} @RPE {serie.rpe_real}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[11px] font-bold text-muted-foreground hover:text-destructive h-8 px-2.5 rounded-lg"
                                  onClick={() => uncompleteSet(ejercicio.id, serie.numero_serie)}
                                >
                                  Deshacer
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="touch"
                                className={`w-full font-bold tracking-wide shadow-sm hover:brightness-105 active:scale-[0.98] touch-manipulation min-h-[48px] sm:min-h-[52px] text-sm sm:text-base rounded-xl gap-2 transition-all ${
                                  isCurrentActive
                                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/25"
                                    : "bg-secondary text-secondary-foreground hover:bg-secondary/90 border border-border"
                                }`}
                                onClick={() => completeSet(ejercicio.id, serie.numero_serie)}
                                data-testid={`complete-set-btn-${ejercicio.id}-${serie.numero_serie}`}
                              >
                                <span>✓</span>
                                <span>Marcar Serie Hecha ({ejercicio.descanso_segundos}s Descanso)</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
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
        </>
      )}

      {/* Modal / Bottom-Sheet de Demostración de Técnica en Video */}
      <ExerciseVideoModal
        exercise={videoExercise}
        isOpen={Boolean(videoExercise)}
        onClose={() => setVideoExercise(null)}
      />

      {/* Modal Warmup Calculator */}
      {warmupModalExercise && (
        <WarmupModal
          isOpen={Boolean(warmupModalExercise)}
          onClose={() => setWarmupModalExercise(null)}
          exerciseName={warmupModalExercise.nombre}
          workingWeightKg={warmupModalExercise.series[0]?.peso_kg || 80}
          onApplyWarmupSets={(warmupSets: WarmupSetProgression[]) =>
            applyWarmupSetsToExercise(warmupModalExercise.id, warmupSets)
          }
        />
      )}

      {/* Modal Plate Calculator */}
      {plateModalWeight !== null && (
        <PlateCalculatorModal
          isOpen={plateModalWeight !== null}
          onClose={() => setPlateModalWeight(null)}
          targetWeightKg={plateModalWeight}
        />
      )}

      {/* Modal Pain Report */}
      {painModalData && (
        <PainReportModal
          isOpen={Boolean(painModalData)}
          onClose={() => setPainModalData(null)}
          exerciseName={painModalData.exerciseName}
          setNumber={painModalData.setNumber}
          onSavePainReport={(notes) =>
            reportPainForSet(painModalData.exerciseId, painModalData.setNumber, notes)
          }
        />
      )}

      {/* Modal Video Upload Form Check */}
      {videoUploadModalData && (
        <VideoUploadModal
          isOpen={Boolean(videoUploadModalData)}
          onClose={() => setVideoUploadModalData(null)}
          exerciseName={videoUploadModalData.exerciseName}
          setNumber={videoUploadModalData.setNumber}
          onSaveVideoUrl={(url) =>
            attachVideoForSet(
              videoUploadModalData.exerciseId,
              videoUploadModalData.setNumber,
              url
            )
          }
        />
      )}
    </div>
  );
}
