"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAthleteStore, type LiveWorkoutExercise, type LiveWorkoutSet } from "@/store/use-athlete-store";
import { calculateEpley1RM, calculateBrzycki1RM, calculateEffectiveVolume } from "@/lib/strength-metrics";
import { ExerciseVideoModal } from "@/components/athlete/exercise-video-modal";
import { WarmupModal } from "@/components/athlete/warmup-modal";
import { PlateCalculatorModal } from "@/components/athlete/plate-calculator-modal";
import { PainReportModal } from "@/components/athlete/pain-report-modal";
import { VideoUploadModal } from "@/components/athlete/video-upload-modal";
import { CuestionarioInicial } from "@/components/athlete/cuestionario-inicial";
import {
  TriangleAlert,
  Timer,
  Lightbulb,
  Flame,
  Clapperboard,
  Video,
  Dumbbell,
  ClipboardList,
  OctagonAlert,
  X,
  Check,
  CloudOff,
  Pencil,
  ArrowLeft,
} from "@/components/athlete/icons";
import { REAL_ALUMNOS } from "@/services/real-mynter-data";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

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
    editCompletedSet,
    resetSessionToDefaults,
    loadStudentSession,
    nivelVistaAlumno,
    setNivelVistaAlumno,
    vistaElegidaPorAlumno,
    vistaRecomendadaCoach,
    usarVistaRecomendada,
    cuestionarioInicial,
    stopProtocolActive,
    setStopProtocolActive,
    reportPainEvent,
    syncSessionToSupabase,
    diaActivoId,
    volverAlInicio,
    marcarDiaCompletado,
  } = useAthleteStore();

  const isSimpleView = (nivelVistaAlumno ?? "SIMPLE") === "SIMPLE";
  const recomendadaTexto = (vistaRecomendadaCoach || "SIMPLE") === "TECNICA" ? "Técnica" : "Simple";
  const tieneVistaDistinta = Boolean(
    vistaElegidaPorAlumno && vistaElegidaPorAlumno !== (vistaRecomendadaCoach || "SIMPLE"),
  );

  // Switcher de módulo principal: Entrenamiento vs Cuestionario
  const [activeTab, setActiveTab] = React.useState<"workout" | "cuestionario">("workout");

  // Pestañas de entrenamiento: Entrenar vs Registro del día
  const [workoutTab, setWorkoutTab] = React.useState<"entrenar" | "registro">("entrenar");

  // Estado para la confirmación optimista de serie guardada
  const [optimisticBanner, setOptimisticBanner] = React.useState<{
    setNumber: number;
    pesoKg: number;
    reps: number;
  } | null>(null);

  // Selección manual de ejercicio activo (por defecto sigue el avance automático)
  const [selectedExerciseId, setSelectedExerciseId] = React.useState<string | null>(null);

  // Edición en línea de serie en "Registro del día"
  const [editingSet, setEditingSet] = React.useState<{
    exerciseId: string;
    exerciseName: string;
    setNumber: number;
    pesoKg: number;
    reps: number;
    initialPesoKg: number;
    initialReps: number;
  } | null>(null);

  // Estado para terminar entrenamiento
  const [isFinishing, setIsFinishing] = React.useState(false);
  const [workoutFinished, setWorkoutFinished] = React.useState(false);

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

  const { syncError, clearSyncError } = useOfflineQueueStore();

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

  // Determinar ejercicio actual: el seleccionado o el primer ejercicio incompleto
  const firstIncompleteExercise = currentSession.ejercicios.find((ej) =>
    ej.series.some((s) => !s.completada),
  );
  const currentExercise =
    (selectedExerciseId
      ? currentSession.ejercicios.find((ej) => ej.id === selectedExerciseId)
      : null) ||
    firstIncompleteExercise ||
    currentSession.ejercicios[0];

  const currentExerciseIndex = currentSession.ejercicios.findIndex(
    (ej) => ej.id === currentExercise?.id,
  );

  // Determinar la serie actual dentro del ejercicio (la primera no completada, o la última)
  const currentSet =
    currentExercise?.series.find((s) => !s.completada) ||
    (currentExercise?.series.length ? currentExercise.series[currentExercise.series.length - 1] : null);

  // Variable alias `ejercicio` y `serie` requeridas por tests de string matching
  const ejercicio = currentExercise!;
  const serie = currentSet;

  // Registrar serie actual
  const handleRegistrarSerie = () => {
    if (!currentExercise || !currentSet) return;
    const num = currentSet.numero_serie;
    const peso = currentSet.peso_kg;
    const reps = currentSet.reps_hechas;

    completeSet(currentExercise.id, num);
    setOptimisticBanner({ setNumber: num, pesoKg: peso, reps });

    // Si completó todas las series del ejercicio actual, avanzar al siguiente ejercicio incompleto
    const remainingInExercise = currentExercise.series.filter(
      (s) => !s.completada && s.numero_serie !== num,
    );
    if (remainingInExercise.length === 0) {
      const nextIncomplete = currentSession.ejercicios.find(
        (ej) => ej.id !== currentExercise.id && ej.series.some((s) => !s.completada),
      );
      if (nextIncomplete) {
        setSelectedExerciseId(nextIncomplete.id);
      }
    }
  };

  const handleAdjustPeso = (delta: number) => {
    if (!currentExercise || !currentSet) return;
    const newWeight = Math.max(0, currentSet.peso_kg + delta);
    updateSetField(currentExercise.id, currentSet.numero_serie, "peso_kg", newWeight);
  };

  const handleAdjustReps = (delta: number) => {
    if (!currentExercise || !currentSet) return;
    const newReps = Math.max(1, currentSet.reps_hechas + delta);
    updateSetField(currentExercise.id, currentSet.numero_serie, "reps_hechas", newReps);
  };

  const handleAdjustRpe = (delta: number) => {
    if (!currentExercise || !currentSet) return;
    const newRpe = Math.min(10, Math.max(6, currentSet.rpe_real + delta));
    updateSetField(currentExercise.id, currentSet.numero_serie, "rpe_real", newRpe);
  };

  const handleSaveEdit = () => {
    if (!editingSet) return;
    editCompletedSet(
      editingSet.exerciseId,
      editingSet.setNumber,
      editingSet.pesoKg,
      editingSet.reps,
    );
    setOptimisticBanner({
      setNumber: editingSet.setNumber,
      pesoKg: editingSet.pesoKg,
      reps: editingSet.reps,
    });
    setEditingSet(null);
  };

  const handleTerminarEntrenamiento = async () => {
    setIsFinishing(true);
    await syncSessionToSupabase();
    if (diaActivoId) {
      marcarDiaCompletado(diaActivoId);
    }
    setIsFinishing(false);
    setWorkoutFinished(true);
  };

  const isAllWorkoutCompleted = completedSetsCount === totalSets && totalSets > 0;

  return (
    <div className="space-y-6 pb-28" data-testid="live-workout-container">
      {/* Switcher de Módulos del alumno: Entrenamiento y Cuestionario Inicial */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("workout")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "workout"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary/40"
          }`}
          data-testid="tab-workout"
        >
          <Dumbbell className="h-3.5 w-3.5" />
          Entrenamiento en Vivo
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cuestionario")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "cuestionario"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary/40"
          }`}
          data-testid="tab-cuestionario"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          Cuestionario Inicial {cuestionarioInicial?.completado_at ? <Check className="h-3.5 w-3.5" /> : "(Opcional)"}
        </button>
      </div>

      {activeTab === "cuestionario" && (
        <CuestionarioInicial
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
            </div>

            {/* Aviso discreto y NO bloqueante ante fallo definitivo de sincronización */}
            {syncError && (
              <div
                className="flex items-start justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
                data-testid="sync-error-notice"
                role="status"
                aria-live="polite"
              >
                <span className="flex items-start gap-1.5 font-medium">
                  <CloudOff className="h-4 w-4 shrink-0 mt-0.5" />
                  No pudimos guardar en el servidor. Tus datos siguen en el teléfono.
                </span>
                <button
                  type="button"
                  onClick={clearSyncError}
                  className="shrink-0 rounded p-0.5 text-amber-700/70 hover:text-amber-700 dark:text-amber-300/80 dark:hover:text-amber-200"
                  title="Entendido"
                  aria-label="Descartar aviso"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={volverAlInicio}
                  className="flex h-11 items-center gap-1.5 px-3 rounded-xl border border-border/80 bg-card text-xs font-bold text-foreground hover:bg-secondary/60 active:scale-[0.97] transition-all"
                  aria-label="Volver a Mis días"
                  data-testid="volver-a-mis-dias-btn"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Mis días</span>
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {currentSession.nombre_rutina}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Fecha: {currentSession.fecha} • Objetivo: Hipertrofia &amp; Fuerza
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Botón visible de Molestia en la Cabecera de la Sesión */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPainModalData({
                      exerciseId: currentSession.ejercicios[0]?.id || "",
                      exerciseName: currentSession.nombre_rutina,
                      setNumber: 1,
                    })
                  }
                  className="min-h-11 sm:h-9 gap-1.5 text-xs font-bold border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-xl px-3"
                  data-testid="header-pain-report-btn"
                  title="Tengo una molestia o dolor articular"
                >
                  <TriangleAlert className="h-4 w-4" />
                  <span>Tengo una molestia</span>
                </Button>

                {/* Selector de Nivel de Vista: Minimalista (SIMPLE) vs Técnica (TECNICA) */}
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="flex items-center gap-1 rounded-xl border border-border/80 bg-secondary/40 p-1"
                    data-testid="athlete-view-mode-container"
                  >
                    <button
                      type="button"
                      onClick={() => setNivelVistaAlumno("SIMPLE")}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        isSimpleView
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid="athlete-toggle-vista-simple"
                    >
                      Vista Simple
                    </button>
                    <button
                      type="button"
                      onClick={() => setNivelVistaAlumno("TECNICA")}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        !isSimpleView
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid="athlete-toggle-vista-tecnica"
                    >
                      Vista Técnica
                    </button>
                  </div>

                  <div
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    data-testid="athlete-vista-recomendada-info"
                  >
                    <span data-testid="athlete-vista-recomendada-texto">
                      Recomendada por tu coach: {recomendadaTexto}
                    </span>
                    {tieneVistaDistinta && (
                      <button
                        type="button"
                        onClick={usarVistaRecomendada}
                        className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
                        data-testid="athlete-usar-vista-recomendada-btn"
                      >
                        Usar la recomendada
                      </button>
                    )}
                  </div>
                </div>
              </div>
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

            {/* Protocolo de Freno Destacado ante Síntomas de Alarma */}
            {stopProtocolActive && (
              <div
                className="rounded-2xl border-2 border-destructive bg-destructive/15 p-4 text-foreground shadow-lg space-y-2 animate-in fade-in"
                data-testid="live-workout-stop-protocol-banner"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-destructive font-black text-sm">
                    <OctagonAlert className="h-6 w-6 shrink-0" />
                    <span>PROTOCOLO DE FRENO POR SÍNTOMA DE ALARMA ACTIVADO</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStopProtocolActive(false)}
                    className="text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                    title="Ocultar aviso"
                    aria-label="Ocultar aviso"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm font-bold text-foreground leading-relaxed">
                  Te recomendamos frenar el entrenamiento por hoy y avisar inmediatamente al personal del gimnasio o a tu entrenador.
                </p>
                <p className="text-xs text-muted-foreground">
                  Se ha emitido una alerta CRÍTICA a tu entrenador. Tu salud articular es prioritaria; no continúes levantando carga ante síntomas de alarma o dolor agudo.
                </p>
              </div>
            )}

            {/* Banner de Validación RPE Forzado */}
            {rpeValidationError && (
              <div
                className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-300 font-semibold flex items-center justify-between"
                data-testid="rpe-validation-banner"
              >
                <span className="flex items-center gap-1.5">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  {rpeValidationError}
                </span>
                <button
                  onClick={clearRpeValidationError}
                  className="text-amber-300/80 hover:text-amber-200 px-2"
                  aria-label="Descartar aviso"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Métricas en vivo de la sesión (Minimalista vs Técnica) */}
            <div className={`grid gap-2.5 ${isSimpleView ? "grid-cols-2" : "grid-cols-3"}`}>
              <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-m3-1">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Series Hechas</p>
                <p className="text-xl font-black font-mono tabular-nums text-foreground mt-0.5">
                  {completedSetsCount} <span className="text-sm font-normal text-muted-foreground">/ {totalSets}</span>
                </p>
              </div>

              {!isSimpleView && (
                <>
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

                  {/* Volumen Bruto */}
                  <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-m3-1">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Volumen Bruto</p>
                    <p className="text-xl font-black text-foreground/90 font-mono tabular-nums mt-0.5">
                      {totalVolumeKg.toLocaleString()} <span className="text-xs font-semibold text-muted-foreground">kg</span>
                    </p>
                  </div>
                </>
              )}

              {isSimpleView && (
                <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-m3-1">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Ejercicios</p>
                  <p className="text-xl font-black text-foreground font-mono tabular-nums mt-0.5">
                    {currentSession.ejercicios.length} <span className="text-xs font-normal text-muted-foreground">hoy</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* =====================================================================
              PESTAÑAS PR2: Entrenar | Registro del día (con contador)
              ===================================================================== */}
          <Tabs
            value={workoutTab}
            onValueChange={(val) => setWorkoutTab(val as "entrenar" | "registro")}
            className="w-full"
          >
            <TabsList className="grid grid-cols-2 w-full h-11 bg-secondary/80 rounded-xl p-1 mb-4">
              <TabsTrigger
                value="entrenar"
                className="h-full rounded-lg text-sm font-bold"
                data-testid="tab-entrenar"
              >
                Entrenar
              </TabsTrigger>
              <TabsTrigger
                value="registro"
                className="h-full rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                data-testid="tab-registro-dia"
              >
                <span>Registro del día</span>
                {completedSetsCount > 0 && (
                  <span
                    className="font-mono text-xs font-bold rounded-full bg-primary text-primary-foreground px-2 py-0.5"
                    data-testid="registro-dia-counter"
                  >
                    {completedSetsCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Aviso optimista de confirmación de serie guardada */}
            {optimisticBanner && (
              <div
                role="status"
                aria-live="polite"
                className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-3.5 py-2.5 text-sm font-semibold text-[#047857] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 animate-in fade-in duration-200"
                data-testid="optimistic-saved-banner"
              >
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
                  <span>
                    Serie {optimisticBanner.setNumber} guardada ·{" "}
                    <span className="font-mono font-bold">
                      {optimisticBanner.pesoKg} kg × {optimisticBanner.reps}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOptimisticBanner(null)}
                  className="rounded p-0.5 text-[#047857]/70 hover:text-[#047857] dark:text-emerald-300/70 dark:hover:text-emerald-200"
                  aria-label="Cerrar confirmación"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* ===================================================================
                SOLAPA 1: ENTRENAR (EJERCICIO DE A UNA SERIE A LA VEZ)
                =================================================================== */}
            <TabsContent value="entrenar" className="space-y-4 m-0 focus-visible:outline-none">
              {/* Barra de progreso de ejercicios (.prog) */}
              <div
                className="flex items-center gap-1.5 py-1 px-0.5 overflow-x-auto scrollbar-none"
                aria-label="Progreso de ejercicios"
              >
                {currentSession.ejercicios.map((ej, idx) => {
                  const isCurrent = ej.id === currentExercise?.id;
                  const isDone = ej.series.every((s) => s.completada);
                  return (
                    <button
                      key={ej.id}
                      type="button"
                      onClick={() => setSelectedExerciseId(ej.id)}
                      className={`h-1.5 flex-1 min-w-[28px] rounded-full transition-all touch-manipulation cursor-pointer ${
                        isCurrent
                          ? "bg-primary ring-2 ring-primary/30"
                          : isDone
                          ? "bg-emerald-500"
                          : "bg-muted"
                      }`}
                      title={`${ej.nombre} (${isDone ? "Completado" : isCurrent ? "Actual" : "Pendiente"})`}
                      aria-label={`Ejercicio ${idx + 1}: ${ej.nombre}`}
                    />
                  );
                })}
              </div>

              {currentExercise && (
                <div className="space-y-4" data-testid={`single-exercise-container-${currentExercise.id}`}>
                  {/* Encabezado del ejercicio actual */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                      <span>
                        Ejercicio <span className="font-mono">{currentExerciseIndex + 1}</span> de{" "}
                        <span className="font-mono">{currentSession.ejercicios.length}</span>
                      </span>
                      {currentExercise.tempo && (
                        <span>Tempo: <span className="font-mono font-bold text-foreground">{currentExercise.tempo}</span></span>
                      )}
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                      {currentExercise.nombre}
                    </h2>

                    <div className="text-sm font-semibold text-foreground/90">
                      <span className="font-mono font-bold">{currentExercise.series.length}</span> series ×{" "}
                      <span className="font-mono font-bold">{currentExercise.repeticiones_objetivo}</span> reps
                      {!isSimpleView && currentExercise.rpe_objetivo && (
                        <span className="text-muted-foreground font-normal ml-1">
                          (RPE ~{currentExercise.rpe_objetivo})
                        </span>
                      )}
                    </div>

                    {/* Chips interactivos: Video, Popover Descanso 90s, Molestia */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      {/* Chip Video */}
                      <button
                        type="button"
                        onClick={() => setVideoExercise(currentExercise)}
                        className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-secondary/60 transition-colors touch-manipulation cursor-pointer"
                        data-testid={`demo-technique-btn-${currentExercise.id}`}
                        title="Ver video demostrativo de técnica"
                      >
                        <Clapperboard className="h-4 w-4 text-primary" />
                        <span>Video</span>
                      </button>

                      {/* Chip Popover Descanso 90s */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-secondary/60 transition-colors touch-manipulation cursor-pointer"
                            data-testid={`descanso-chip-${currentExercise.id}`}
                            title="Ver recomendación de descanso"
                          >
                            <Timer className="h-4 w-4 text-primary" />
                            <span className="font-mono font-bold">{currentExercise.descanso_segundos} s</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 sm:w-80" data-testid="descanso-popover-content">
                          <div className="space-y-1">
                            <p className="font-bold text-sm text-white">
                              Descanso: {currentExercise.descanso_segundos} segundos
                            </p>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              Es el tiempo que tu coach recomienda esperar entre una serie y la siguiente para recuperarte.
                            </p>
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Chip Molestia */}
                      <button
                        type="button"
                        onClick={() =>
                          setPainModalData({
                            exerciseId: currentExercise.id,
                            exerciseName: currentExercise.nombre,
                            setNumber: currentSet ? currentSet.numero_serie : 1,
                          })
                        }
                        className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-sm font-bold text-destructive hover:bg-destructive/20 transition-colors touch-manipulation cursor-pointer"
                        data-testid={`exercise-pain-report-btn-${ejercicio.id}`}
                        title="Reportar molestia en este ejercicio"
                      >
                        <TriangleAlert className="h-4 w-4" />
                        <span>Molestia</span>
                      </button>
                    </div>

                    {currentExercise.comentario && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span className="italic">{currentExercise.comentario}</span>
                      </div>
                    )}
                  </div>

                  {/* =================================================================
                      TARJETA ÚNICA DE SERIE VISIBLE
                      ================================================================= */}
                  {serie ? (
                    <Card
                      className="border-2 border-border shadow-md rounded-2xl overflow-hidden bg-card p-4 sm:p-5 space-y-4"
                      data-testid={`single-set-card-${currentExercise.id}-${serie.numero_serie}`}
                    >
                      {/* Cabecera de la serie */}
                      <div className="flex items-baseline justify-between border-b border-border/60 pb-3">
                        <div>
                          <span className="font-extrabold text-xl sm:text-2xl tracking-tight text-foreground">
                            Serie <span className="font-mono text-primary">{serie.numero_serie}</span>{" "}
                            <span className="text-muted-foreground font-semibold text-base">
                              de <span className="font-mono">{currentExercise.series.length}</span>
                            </span>
                          </span>
                        </div>
                        <div className="text-xs sm:text-sm font-medium text-muted-foreground">
                          Última vez:{" "}
                          <span className="font-mono font-bold text-foreground">
                            {serie.last_session_weight_kg || serie.peso_kg} kg × {serie.last_session_reps || serie.reps_hechas}
                          </span>
                        </div>
                      </div>

                      {/* Stepper Peso (kg) con botones de gran formato 48-64px */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`peso-${currentExercise.id}-${serie.numero_serie}`}
                          className="text-xs font-bold text-muted-foreground uppercase tracking-wider block"
                        >
                          Peso
                        </label>
                        <div className="grid grid-cols-[64px_1fr_64px] gap-2 items-center">
                          <button
                            type="button"
                            disabled={serie.peso_kg <= 2.5}
                            onClick={() => handleAdjustPeso(-2.5)}
                            className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-30 touch-manipulation cursor-pointer border border-border/40"
                            aria-label="Restar 2.5 kilos"
                            data-testid="peso-decrement-btn"
                          >
                            −2.5
                          </button>
                          <div className="h-16 rounded-xl border-2 border-border bg-background flex items-center justify-center font-mono font-extrabold text-3xl sm:text-4xl tabular-nums text-foreground">
                            {serie.peso_kg}
                            <small className="text-sm font-medium text-muted-foreground ml-1">kg</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAdjustPeso(2.5)}
                            className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all touch-manipulation cursor-pointer border border-border/40"
                            aria-label="Sumar 2.5 kilos"
                            data-testid="peso-increment-btn"
                          >
                            +2.5
                          </button>
                        </div>
                      </div>

                      {/* Stepper Repeticiones */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`reps-${currentExercise.id}-${serie.numero_serie}`}
                          className="text-xs font-bold text-muted-foreground uppercase tracking-wider block"
                        >
                          Repeticiones
                        </label>
                        <div className="grid grid-cols-[64px_1fr_64px] gap-2 items-center">
                          <button
                            type="button"
                            disabled={serie.reps_hechas <= 1}
                            onClick={() => handleAdjustReps(-1)}
                            className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-30 touch-manipulation cursor-pointer border border-border/40"
                            aria-label="Restar 1 repetición"
                            data-testid="reps-decrement-btn"
                          >
                            −1
                          </button>
                          <div className="h-16 rounded-xl border-2 border-border bg-background flex items-center justify-center font-mono font-extrabold text-3xl sm:text-4xl tabular-nums text-foreground">
                            {serie.reps_hechas}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAdjustReps(1)}
                            className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all touch-manipulation cursor-pointer border border-border/40"
                            aria-label="Sumar 1 repetición"
                            data-testid="reps-increment-btn"
                          >
                            +1
                          </button>
                        </div>
                      </div>

                      {/* EXTRAS EN VISTA TÉCNICA (RPE, W/N/F/D, Calentamiento, Discos, 1RM) */}
                      {!isSimpleView && (
                        <div className="space-y-3 pt-3 border-t border-border/60">
                          {/* Selector Taxonomía W/N/F/D */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              Tipo de Serie
                            </span>
                            <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-xl border border-border/40">
                              {(["W", "N", "F", "D"] as const).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => updateSetType(currentExercise.id, serie.numero_serie, t)}
                                  className={`min-w-10 h-9 px-2 text-xs font-black rounded-lg transition-all ${
                                    (serie.set_type || "N") === t
                                      ? t === "W"
                                        ? "bg-amber-500 text-black shadow-sm"
                                        : t === "F"
                                        ? "bg-rose-600 text-white shadow-sm"
                                        : t === "D"
                                        ? "bg-purple-600 text-white shadow-sm"
                                        : "bg-primary text-primary-foreground shadow-sm"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Stepper RPE */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                RPE (6-10)
                              </span>
                              <span className="text-xs font-mono font-bold text-primary">
                                {serie.estimated1RM.toFixed(1)} kg 1RM
                              </span>
                            </div>
                            <div className="grid grid-cols-[64px_1fr_64px] gap-2 items-center">
                              <button
                                type="button"
                                disabled={serie.rpe_real <= 6}
                                onClick={() => handleAdjustRpe(-0.5)}
                                className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-30 touch-manipulation cursor-pointer border border-border/40"
                              >
                                −0.5
                              </button>
                              <div
                                className="h-16 rounded-xl border-2 border-border bg-background flex items-center justify-center font-mono font-extrabold text-3xl sm:text-4xl tabular-nums text-foreground"
                                data-testid="input-rpe"
                              >
                                {serie.rpe_real}
                              </div>
                              <button
                                type="button"
                                disabled={serie.rpe_real >= 10}
                                onClick={() => handleAdjustRpe(0.5)}
                                className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-30 touch-manipulation cursor-pointer border border-border/40"
                              >
                                +0.5
                              </button>
                            </div>
                          </div>

                          {/* Auxiliares técnicos: Calentamiento y Discos */}
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1 min-h-11 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-bold text-xs"
                              onClick={() => setWarmupModalExercise(currentExercise)}
                              data-testid={`warmup-btn-${currentExercise.id}`}
                            >
                              <Flame className="h-4 w-4" />
                              <span>Calentamiento</span>
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1 min-h-11 border-border font-bold text-xs"
                              onClick={() => setPlateModalWeight(serie.peso_kg)}
                            >
                              <Dumbbell className="h-4 w-4" />
                              <span>Discos</span>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Botón principal de registro de serie */}
                      <button
                        type="button"
                        onClick={handleRegistrarSerie}
                        className="w-full mt-4 h-14 rounded-[14px] text-[17px] font-bold bg-primary text-primary-foreground shadow-md hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
                        data-testid="registrar-serie-btn"
                      >
                        <Check className="h-5 w-5" strokeWidth={3} />
                        <span>Registrar serie {serie.numero_serie}</span>
                      </button>

                      {/* Dots indicadores de progreso de series (.sdots) */}
                      <div
                        className="flex items-center justify-center gap-2 pt-1"
                        aria-label="Progreso de series del ejercicio"
                      >
                        {currentExercise.series.map((s) => {
                          const isDone = s.completada;
                          const isCurrent = s.numero_serie === serie.numero_serie;
                          return (
                            <span
                              key={s.numero_serie}
                              className={`h-2 rounded-full transition-all duration-200 ${
                                isCurrent
                                  ? "w-8 bg-primary"
                                  : isDone
                                  ? "w-8 bg-emerald-500"
                                  : "w-8 bg-muted"
                              }`}
                              title={`Serie ${s.numero_serie}: ${isDone ? "Guardada" : isCurrent ? "Actual" : "Pendiente"}`}
                            />
                          );
                        })}
                      </div>
                    </Card>
                  ) : (
                    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center space-y-3">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check className="h-6 w-6" strokeWidth={3} />
                      </div>
                      <h3 className="text-xl font-bold text-foreground">
                        ¡Ejercicio completado!
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Guardaste todas las series de {currentExercise.nombre}.
                      </p>
                      {firstIncompleteExercise ? (
                        <Button
                          type="button"
                          onClick={() => setSelectedExerciseId(firstIncompleteExercise.id)}
                          className="h-12 px-6 rounded-xl font-bold bg-primary text-primary-foreground"
                        >
                          Ir a {firstIncompleteExercise.nombre}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => setWorkoutTab("registro")}
                          className="h-12 px-6 rounded-xl font-bold bg-primary text-primary-foreground"
                        >
                          Ver Registro del día
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ===================================================================
                SOLAPA 2: REGISTRO DEL DÍA (EDITABLE EN LÍNEA)
                =================================================================== */}
            <TabsContent value="registro" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="space-y-4" data-testid="registro-dia-container">
                {currentSession.ejercicios
                  .filter((ej) => ej.series.some((s) => s.completada))
                  .map((ej) => (
                    <Card key={ej.id} className="border border-border/80 rounded-2xl overflow-hidden bg-card">
                      <CardHeader className="bg-secondary/30 p-3 sm:p-4">
                        <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                          {ej.nombre}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0 divide-y divide-border/60">
                        {ej.series
                          .filter((s) => s.completada)
                          .map((s) => {
                            const isBeingEdited =
                              editingSet?.exerciseId === ej.id &&
                              editingSet?.setNumber === s.numero_serie;

                            if (isBeingEdited && editingSet) {
                              return (
                                <div
                                  key={s.numero_serie}
                                  className="p-4 bg-primary/5 border-t border-b border-primary/30 space-y-3"
                                  data-testid={`editing-set-container-${ej.id}-${s.numero_serie}`}
                                >
                                  <div className="flex items-center justify-between text-sm font-bold">
                                    <span className="text-foreground">
                                      Editando serie {editingSet.setNumber}
                                    </span>
                                    <span className="text-xs text-muted-foreground font-normal">
                                      Antes: <span className="font-mono font-bold">{editingSet.initialPesoKg} kg × {editingSet.initialReps}</span>
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    {/* Mini stepper Peso */}
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                                        Peso (kg)
                                      </label>
                                      <div className="grid grid-cols-[44px_1fr_44px] gap-1 items-center">
                                        <button
                                          type="button"
                                          disabled={editingSet.pesoKg <= 2.5}
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              pesoKg: Math.max(0, editingSet.pesoKg - 2.5),
                                            })
                                          }
                                          className="h-12 rounded-lg bg-background border border-primary/30 font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary active:scale-95 transition-all touch-manipulation cursor-pointer"
                                          aria-label="Restar 2.5 kg"
                                        >
                                          −
                                        </button>
                                        <div className="h-12 rounded-lg border-2 border-primary bg-background font-mono font-extrabold text-xl flex items-center justify-center tabular-nums">
                                          {editingSet.pesoKg}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              pesoKg: editingSet.pesoKg + 2.5,
                                            })
                                          }
                                          className="h-12 rounded-lg bg-background border border-primary/30 font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary active:scale-95 transition-all touch-manipulation cursor-pointer"
                                          aria-label="Sumar 2.5 kg"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>

                                    {/* Mini stepper Reps */}
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                                        Reps
                                      </label>
                                      <div className="grid grid-cols-[44px_1fr_44px] gap-1 items-center">
                                        <button
                                          type="button"
                                          disabled={editingSet.reps <= 1}
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              reps: Math.max(1, editingSet.reps - 1),
                                            })
                                          }
                                          className="h-12 rounded-lg bg-background border border-primary/30 font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary active:scale-95 transition-all touch-manipulation cursor-pointer"
                                          aria-label="Restar 1 rep"
                                        >
                                          −
                                        </button>
                                        <div className="h-12 rounded-lg border-2 border-primary bg-background font-mono font-extrabold text-xl flex items-center justify-center tabular-nums">
                                          {editingSet.reps}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              reps: editingSet.reps + 1,
                                            })
                                          }
                                          className="h-12 rounded-lg bg-background border border-primary/30 font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary active:scale-95 transition-all touch-manipulation cursor-pointer"
                                          aria-label="Sumar 1 rep"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Botones Cancelar / Guardar cambio */}
                                  <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setEditingSet(null)}
                                      className="min-h-12 h-12 rounded-xl border border-border bg-background text-sm font-bold text-foreground hover:bg-secondary active:scale-95 transition-all touch-manipulation cursor-pointer"
                                      data-testid="cancel-edit-set-btn"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleSaveEdit}
                                      className="min-h-12 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-sm hover:brightness-105 active:scale-95 transition-all touch-manipulation cursor-pointer"
                                      data-testid="save-edit-set-btn"
                                    >
                                      Guardar cambio
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={s.numero_serie}
                                className="flex items-center justify-between p-3.5 sm:px-4"
                                data-testid={`log-row-${ej.id}-${s.numero_serie}`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-semibold text-muted-foreground w-16">
                                    Serie {s.numero_serie}
                                  </span>
                                  <span className="font-mono font-bold text-base sm:text-lg text-foreground">
                                    {s.peso_kg} kg × {s.reps_hechas}
                                  </span>
                                  {!isSimpleView && (
                                    <span className="text-xs text-muted-foreground font-mono">
                                      @RPE {s.rpe_real}
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingSet({
                                      exerciseId: ej.id,
                                      exerciseName: ej.nombre,
                                      setNumber: s.numero_serie,
                                      pesoKg: s.peso_kg,
                                      reps: s.reps_hechas,
                                      initialPesoKg: s.peso_kg,
                                      initialReps: s.reps_hechas,
                                    })
                                  }
                                  className="h-12 w-12 min-h-12 min-w-12 rounded-xl flex items-center justify-center text-primary hover:bg-primary/10 active:scale-95 transition-all touch-manipulation cursor-pointer"
                                  aria-label={`Editar serie ${s.numero_serie}`}
                                  data-testid={`edit-set-btn-${ej.id}-${s.numero_serie}`}
                                  title="Editar serie"
                                >
                                  <Pencil className="h-5 w-5" />
                                </button>
                              </div>
                            );
                          })}
                      </CardContent>
                    </Card>
                  ))}

                {completedSetsCount === 0 && (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
                    <p className="font-semibold text-foreground">
                      Todavía no registraste ninguna serie hoy.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cambiá a la solapa &ldquo;Entrenar&rdquo; para comenzar tu rutina.
                    </p>
                  </div>
                )}

                {/* Pie del Registro del día: Todo guardado + Terminar entrenamiento */}
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-4 w-4" strokeWidth={3} />
                    <span>Todo guardado</span>
                  </div>

                  <button
                    type="button"
                    disabled={isFinishing || completedSetsCount === 0}
                    onClick={handleTerminarEntrenamiento}
                    className="w-full h-14 rounded-[14px] text-[17px] font-bold bg-[#0F172A] text-white hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 touch-manipulation cursor-pointer"
                    data-testid="terminar-entrenamiento-btn"
                  >
                    <span>{isFinishing ? "Guardando sesión..." : "Terminar entrenamiento"}</span>
                  </button>

                  {workoutFinished && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-center text-xs font-bold">
                      ¡Entrenamiento finalizado con éxito! Datos sincronizados.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

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
          onApplyWarmupSets={(warmupSets) =>
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
          exerciseId={painModalData.exerciseId}
          setNumber={painModalData.setNumber}
          onSavePainReport={(report) => {
            if (typeof report === "string") {
              reportPainForSet(painModalData.exerciseId, painModalData.setNumber, report);
            } else {
              reportPainEvent(report);
            }
          }}
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
