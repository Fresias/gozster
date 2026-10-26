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
  Trophy,
  Settings,
  Trash2,
} from "@/components/athlete/icons";
import { REAL_ALUMNOS } from "@/services/real-mynter-data";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { UltimaVez } from "@/components/athlete/ultima-vez";
import { SugerenciaCarga } from "@/components/athlete/sugerencia-carga";
import { AvisoRecord } from "@/components/athlete/aviso-record";
import { sugerirCarga } from "@/lib/sugerencia-carga";
import { esNuevoRecord, type ResultadoRecord } from "@/lib/record-ejercicio";
import { triggerHapticVibration } from "@/lib/sound";

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
    deleteCompletedSet,
    resetSessionToDefaults,
    loadStudentSession,
    nivelVistaAlumno,
    setNivelVistaAlumno,
    vistaElegidaPorAlumno,
    vistaRecomendadaCoach,
    usarVistaRecomendada,
    pasoIncrementoPeso,
    setPasoIncrementoPeso,
    cuestionarioInicial,
    stopProtocolActive,
    setStopProtocolActive,
    reportPainEvent,
    syncSessionToSupabase,
    diaActivoId,
    volverAlInicio,
    marcarDiaCompletado,
    ultimaVez,
    cargandoUltimaVez,
    cargarUltimaVez,
    marcas,
    registrarSerieEnMarcas,
    stopTimer,
  } = useAthleteStore();

  const isSimpleView = (nivelVistaAlumno ?? "SIMPLE") === "SIMPLE";
  const recomendadaTexto = (vistaRecomendadaCoach || "SIMPLE") === "TECNICA" ? "Técnica" : "Simple";
  const tieneVistaDistinta = Boolean(
    vistaElegidaPorAlumno && vistaElegidaPorAlumno !== (vistaRecomendadaCoach || "SIMPLE"),
  );

  const pasoPeso = pasoIncrementoPeso || 2.5;

  // Switcher de módulo principal: Entrenamiento vs Cuestionario
  const [activeTab, setActiveTab] = React.useState<"workout" | "cuestionario">("workout");

  // Pestañas de entrenamiento: Entrenar vs Registro del día
  const [workoutTab, setWorkoutTab] = React.useState<"entrenar" | "registro">("entrenar");

  // Modal de configuración del alumno
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  // Estado para la confirmación optimista de serie guardada
  const [optimisticBanner, setOptimisticBanner] = React.useState<{
    setNumber: number;
    pesoKg: number;
    reps: number;
    record?: { resultado: ResultadoRecord; exerciseName: string; peso_kg: number; reps_hechas: number };
  } | null>(null);

  // Series que resultaron récord en esta sesión
  const [seriesRecord, setSeriesRecord] = React.useState<Set<string>>(() => new Set());

  // Selección manual de ejercicio activo
  const [selectedExerciseId, setSelectedExerciseId] = React.useState<string | null>(null);

  // Edición en línea de serie en "Registro de la sesión"
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

  const { syncError, clearSyncError, isOnline } = useOfflineQueueStore();

  // "La última vez": se descarga al abrir la sesión y al volver la conexión
  React.useEffect(() => {
    if (isOnline) void cargarUltimaVez();
  }, [currentSession.id, isOnline, cargarUltimaVez]);

  const totalSets = currentSession.ejercicios.reduce(
    (acc, ej) => acc + ej.series.length,
    0,
  );

  const completedSetsCount = currentSession.ejercicios.reduce(
    (acc, ej) => acc + ej.series.filter((s) => s.completada).length,
    0,
  );

  const completedExercisesCount = currentSession.ejercicios.filter(
    (ej) => ej.series.length > 0 && ej.series.every((s) => s.completada),
  ).length;

  const totalExercises = currentSession.ejercicios.length;
  const progressPercent = totalExercises > 0 ? Math.round((completedExercisesCount / totalExercises) * 100) : 0;

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

  // Sugerencia de carga (GOZS-160, spec historial-progreso §2) para la serie visible.
  const sugerencia =
    currentExercise && serie
      ? sugerirCarga(ultimaVez[currentExercise.ejercicio_id ?? currentExercise.id], {
          numeroSerie: serie.numero_serie,
          repeticionesObjetivo: currentExercise.repeticiones_objetivo,
          seriesPrescriptas: currentExercise.series.length,
          musculosPrincipales: currentExercise.musculos_principales,
          setType: serie.set_type,
        })
      : null;

  // §2.5: se precarga una sola vez por serie pendiente y nunca encima de lo que el alumno ya tocó.
  const seriesTocadas = React.useRef(new Set<string>());
  const claveSerie = currentExercise && serie ? `${currentExercise.id}-${serie.numero_serie}` : null;
  const pesoSugerido = sugerencia?.pesoSugerido;
  const repsSugeridas = sugerencia?.repsSugeridas;
  React.useEffect(() => {
    if (!claveSerie || !currentExercise || !serie || serie.completada) return;
    if (pesoSugerido === undefined || repsSugeridas === undefined) return;
    if (seriesTocadas.current.has(claveSerie)) return;
    seriesTocadas.current.add(claveSerie);
    updateSetField(currentExercise.id, serie.numero_serie, "peso_kg", pesoSugerido);
    updateSetField(currentExercise.id, serie.numero_serie, "reps_hechas", repsSugeridas);
  }, [claveSerie, pesoSugerido, repsSugeridas]);

  // Registrar serie actual
  const handleRegistrarSerie = () => {
    if (!currentExercise || !currentSet) return;
    const num = currentSet.numero_serie;
    const peso = currentSet.peso_kg;
    const reps = currentSet.reps_hechas;
    const setType = currentSet.set_type;
    const ejId = currentExercise.ejercicio_id ?? currentExercise.id;

    const serieCandidata = { peso_kg: peso, reps_hechas: reps, set_type: setType };
    const resultado = esNuevoRecord(serieCandidata, marcas[ejId] ?? null);

    completeSet(currentExercise.id, num);
    registrarSerieEnMarcas(ejId, serieCandidata);

    if (resultado.esRecord) {
      setSeriesRecord((prev) => new Set(prev).add(`${currentExercise.id}-${num}`));
      triggerHapticVibration([60, 40, 60]);
      setOptimisticBanner({
        setNumber: num,
        pesoKg: peso,
        reps,
        record: { resultado, exerciseName: currentExercise.nombre, peso_kg: peso, reps_hechas: reps },
      });
    } else {
      setOptimisticBanner({ setNumber: num, pesoKg: peso, reps });
    }

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
    seriesTocadas.current.add(`${currentExercise.id}-${currentSet.numero_serie}`);
    const newWeight = Math.max(0, currentSet.peso_kg + delta);
    updateSetField(currentExercise.id, currentSet.numero_serie, "peso_kg", newWeight);
  };

  const handleAdjustReps = (delta: number) => {
    if (!currentExercise || !currentSet) return;
    seriesTocadas.current.add(`${currentExercise.id}-${currentSet.numero_serie}`);
    const newReps = Math.max(1, currentSet.reps_hechas + delta);
    updateSetField(currentExercise.id, currentSet.numero_serie, "reps_hechas", newReps);
  };

  const handleDirectUpdatePeso = (val: number) => {
    if (!currentExercise || !currentSet) return;
    seriesTocadas.current.add(`${currentExercise.id}-${currentSet.numero_serie}`);
    updateSetField(currentExercise.id, currentSet.numero_serie, "peso_kg", Math.max(0, val));
  };

  const handleDirectUpdateReps = (val: number) => {
    if (!currentExercise || !currentSet) return;
    seriesTocadas.current.add(`${currentExercise.id}-${currentSet.numero_serie}`);
    updateSetField(currentExercise.id, currentSet.numero_serie, "reps_hechas", Math.max(1, val));
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
    stopTimer();
    await syncSessionToSupabase();
    if (diaActivoId) {
      marcarDiaCompletado(diaActivoId);
    }
    setIsFinishing(false);
    setWorkoutFinished(true);
  };

  const cleanDiaTitle = React.useMemo(() => {
    const raw = currentSession.nombre_rutina || "";
    const parts = raw.split(":");
    if (parts.length > 1) {
      return parts.slice(1).join(":").trim();
    }
    return raw;
  }, [currentSession.nombre_rutina]);

  const isAllWorkoutCompleted = completedSetsCount === totalSets && totalSets > 0;

  return (
    <div className="space-y-6 pb-28" data-testid="live-workout-container">
      {/* Vista de Cuestionario Inicial si fue activado desde Configuración */}
      {activeTab === "cuestionario" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveTab("workout")}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-border/80 bg-card text-foreground hover:bg-secondary/60 active:scale-[0.98] transition-all touch-manipulation cursor-pointer"
              data-testid="tab-workout"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a entrenar</span>
            </button>
            <span className="text-xs font-semibold text-muted-foreground">Cuestionario Inicial</span>
          </div>
          <CuestionarioInicial
            athleteId={currentSession.studentId || "66b92b9a-1ce7-4e2e-a47c-7c5600000000"}
            athleteName={currentSession.studentName || "Fernando Rosales"}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header de la sesión del alumno */}
          <div className="space-y-3">
            {/* Conmutador rápido de vista de atleta (Fernando Rosales vs Gabriel Sánchez) */}
            <div
              className="flex items-center gap-1.5 p-1 rounded-2xl bg-secondary/60 border border-border/80"
              data-testid="athlete-switcher-container"
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedExerciseId(null);
                  loadStudentSession("66b92b9a-1ce7-4e2e-a47c-7c5600000000");
                }}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all touch-manipulation cursor-pointer flex items-center justify-center gap-1.5 ${
                  !currentSession?.studentName?.toLowerCase().includes("gabriel")
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="athlete-switcher-fernando"
              >
                <span>Fernando Rosales</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedExerciseId(null);
                  loadStudentSession("0a7a4dfd-e040-4b92-ac29-9507cbb13215");
                }}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all touch-manipulation cursor-pointer flex items-center justify-center gap-1.5 ${
                  currentSession?.studentName?.toLowerCase().includes("gabriel")
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="athlete-switcher-gabriel"
              >
                <span>Gabriel Sánchez (yo, gabi)</span>
              </button>
            </div>
            {/* Aviso de error de sincronización offline */}
            {syncError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300 animate-in fade-in duration-200"
                data-testid="sync-error-notice"
              >
                <div className="flex items-center gap-2">
                  <CloudOff className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>
                    No pudimos guardar en el servidor. Tus datos siguen en el teléfono.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearSyncError}
                  className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500/70 hover:text-rose-500 touch-manipulation cursor-pointer"
                  aria-label="Cerrar aviso de error"
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
                  className="flex h-11 items-center gap-1.5 px-3 rounded-xl border border-border/80 bg-card text-xs font-bold text-foreground hover:bg-secondary/60 active:scale-[0.97] transition-all touch-manipulation cursor-pointer"
                  aria-label="Volver a Mis días"
                  data-testid="volver-a-mis-dias-btn"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Mis días</span>
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {cleanDiaTitle}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentSession.studentName} · {currentSession.ejercicios.length} ejercicios
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
                  className="min-h-11 sm:h-9 gap-1.5 text-xs font-bold border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-xl px-3 touch-manipulation cursor-pointer"
                  data-testid="header-pain-report-btn"
                  title="Tengo una molestia o dolor articular"
                >
                  <TriangleAlert className="h-4 w-4" />
                  <span>Tengo una molestia</span>
                </Button>

                {/* Botón de Configuración (⚙️) que abre el modal con vista Simple/Técnica y cuestionario */}
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="h-11 w-11 flex items-center justify-center rounded-xl border border-border/80 bg-card text-foreground hover:bg-secondary/60 active:scale-95 transition-all touch-manipulation cursor-pointer"
                  aria-label="Abrir configuración"
                  data-testid="athlete-settings-btn"
                  title="Configuración de la app"
                >
                  <Settings className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Protocolo de Freno Destacado ante Síntomas de Alarma */}
            {stopProtocolActive && (
              <div
                role="alert"
                className="rounded-2xl border-2 border-destructive bg-destructive/10 p-4 space-y-2 animate-in fade-in duration-300"
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

            {/* Banner de Validación RPE */}
            {rpeValidationError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3.5 py-2.5 text-xs font-semibold text-amber-200 animate-in fade-in duration-200"
                data-testid="rpe-validation-banner"
              >
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>{rpeValidationError}</span>
                </div>
                <button
                  type="button"
                  onClick={clearRpeValidationError}
                  className="text-amber-300/80 hover:text-amber-200 px-2 touch-manipulation cursor-pointer"
                  aria-label="Descartar aviso"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Barra azul llenándose con progreso de ejercicios */}
            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  {completedExercisesCount} de {totalExercises} ejercicios completados
                </span>
                <span className="font-mono text-xs font-bold text-primary">
                  {progressPercent}%
                </span>
              </div>
              <div className="h-2.5 w-full bg-secondary/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {!isSimpleView && (
                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                  <span>
                    Vol. Efectivo (Hevy): <strong className="text-primary font-mono">{effectiveVolumeKg.toLocaleString()} kg</strong>
                  </span>
                  <span>
                    Volumen Bruto: <strong className="text-foreground font-mono">{totalVolumeKg.toLocaleString()} kg</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* =====================================================================
              PESTAÑAS: Entrenar | Registro de la sesión (con contador)
              ===================================================================== */}
          <Tabs
            value={workoutTab}
            onValueChange={(val) => setWorkoutTab(val as "entrenar" | "registro")}
            className="w-full"
          >
            <TabsList className="grid grid-cols-2 w-full h-11 bg-secondary/80 rounded-xl p-1 mb-4">
              <TabsTrigger
                value="entrenar"
                className="h-full rounded-lg text-sm font-bold touch-manipulation cursor-pointer"
                data-testid="tab-entrenar"
              >
                Entrenar
              </TabsTrigger>
              <TabsTrigger
                value="registro"
                className="h-full rounded-lg text-sm font-bold flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
                data-testid="tab-registro-dia"
              >
                <span>Registro de la sesión</span>
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

            {/* Aviso optimista: récord (§3) reemplaza al verde "Serie N guardada"; nunca ambos. */}
            {optimisticBanner?.record?.resultado.esRecord ? (
              <AvisoRecord
                resultado={optimisticBanner.record.resultado}
                serie={{
                  peso_kg: optimisticBanner.record.peso_kg,
                  reps_hechas: optimisticBanner.record.reps_hechas,
                }}
                nombreEjercicio={optimisticBanner.record.exerciseName}
                tecnica={!isSimpleView}
                onClose={() => setOptimisticBanner(null)}
              />
            ) : optimisticBanner ? (
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
                  className="-m-2 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-[#047857]/70 hover:text-[#047857] dark:text-emerald-300/70 dark:hover:text-emerald-200 touch-manipulation cursor-pointer"
                  aria-label="Cerrar confirmación"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {/* ===================================================================
                SOLAPA 1: ENTRENAR (OPCIÓN B: 1 COLUMNA COMPLETA SIN TEXTOS REDUNDANTES)
                =================================================================== */}
            <TabsContent value="entrenar" className="space-y-4 m-0 focus-visible:outline-none">
              {/* Selector de ejercicios en 1 columna completa (Opción B) */}
              {/* Tarjeta destacada al completar todo el entrenamiento (GH #174) */}
              {isAllWorkoutCompleted && (
                <div
                  className="rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-500/15 via-emerald-500/10 to-card p-4 sm:p-5 shadow-lg space-y-3"
                  data-testid="terminar-entrenamiento-card-entrenar"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md">
                        <Check className="h-6 w-6" strokeWidth={3} />
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                          ¡Entrenamiento completado!
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Completaste todas las series de tu rutina ({completedSetsCount} de {totalSets}).
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-full">
                      100%
                    </span>
                  </div>

                  <Button
                    type="button"
                    disabled={isFinishing || workoutFinished}
                    onClick={handleTerminarEntrenamiento}
                    className="w-full h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground shadow-lg hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
                    data-testid="terminar-entrenamiento-btn-entrenar"
                  >
                    <Check className="h-5 w-5" strokeWidth={3} />
                    <span>
                      {isFinishing
                        ? "Guardando entrenamiento…"
                        : workoutFinished
                        ? "¡Entrenamiento finalizado!"
                        : "Terminar y Guardar Entrenamiento"}
                    </span>
                  </Button>

                  {workoutFinished && volverAlInicio && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={volverAlInicio}
                      className="w-full h-12 rounded-xl text-sm font-bold border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center justify-center gap-2"
                      data-testid="volver-mis-dias-tras-terminar-btn"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Volver a Mis días</span>
                    </Button>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1.5" data-testid="exercise-selector-column">
                {currentSession.ejercicios.map((ej, idx) => {
                  const isSelected = ej.id === currentExercise?.id;
                  const isDone = ej.series.every((s) => s.completada);
                  const completedCount = ej.series.filter((s) => s.completada).length;
                  const isWarmup =
                    ej.nombre.toLowerCase().includes("warm up") ||
                    ej.nombre.toLowerCase().includes("calentamiento");

                  return (
                    <button
                      key={ej.id}
                      type="button"
                      onClick={() => setSelectedExerciseId(ej.id)}
                      data-testid={`exercise-select-btn-${ej.id}`}
                      className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border text-left transition-all touch-manipulation cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                          : isDone
                          ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-secondary/40"
                          : "border-border/70 bg-card hover:bg-secondary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 pr-2">
                        {/* Ordinal estilizado a la izquierda */}
                        <div
                          className={`h-6 w-6 rounded-lg text-xs font-mono font-extrabold flex items-center justify-center shrink-0 transition-colors ${
                            isDone
                              ? "bg-emerald-500 text-white"
                              : isSelected
                              ? "bg-primary text-white"
                              : "bg-secondary/70 text-muted-foreground"
                          }`}
                        >
                          {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : idx + 1}
                        </div>

                        {/* Detalles del ejercicio (nombre completo + meta) */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isWarmup && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-500 uppercase tracking-wider shrink-0">
                                Warm up
                              </span>
                            )}
                            <span
                              className={`text-xs sm:text-sm font-bold leading-tight ${
                                isSelected ? "text-primary" : "text-foreground"
                              }`}
                            >
                              {ej.nombre}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {ej.repeticiones_objetivo}
                          </p>
                        </div>
                      </div>

                      {/* Estado a la derecha (sin repetir 'series') */}
                      <div className="shrink-0 flex items-center gap-1 pl-1">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                            <Check className="h-3 w-3" strokeWidth={3} /> Hecho
                          </span>
                        ) : (
                          <span
                            className={`text-xs font-mono font-bold ${
                              isSelected ? "text-primary" : "text-muted-foreground"
                            }`}
                          >
                            {completedCount}/{ej.series.length}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {currentExercise && (
                <div className="space-y-4 pt-1" data-testid={`single-exercise-container-${currentExercise.id}`}>
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

                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                          {currentExercise.nombre}
                        </h2>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {currentExercise.musculos_principales.map((m) => (
                            <span
                              key={m}
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        {currentExercise.url_video && (
                          <button
                            type="button"
                            onClick={() => setVideoExercise(currentExercise)}
                            className="h-10 px-2.5 rounded-xl border border-border/80 bg-card text-foreground hover:bg-secondary/60 flex items-center gap-1.5 text-xs font-bold transition-all touch-manipulation cursor-pointer"
                            title="Ver video explicativo de técnica"
                            data-testid={`demo-technique-btn-${currentExercise.id}`}
                          >
                            <Video className="h-4 w-4 text-primary" />
                            <span className="hidden sm:inline">Técnica</span>
                          </button>
                        )}

                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="h-10 px-2.5 rounded-xl border border-border/80 bg-card text-foreground hover:bg-secondary/60 flex items-center gap-1.5 text-xs font-bold transition-all touch-manipulation cursor-pointer"
                              title="Ver recomendación de descanso"
                              data-testid={`descanso-chip-${currentExercise.id}`}
                            >
                              <Timer className="h-4 w-4 text-primary" />
                              <span className="font-mono">{currentExercise.descanso_segundos}s</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 sm:w-80" data-testid="descanso-popover-content">
                            <div className="space-y-1.5 text-xs">
                              <p className="font-bold text-foreground">
                                Descanso: {currentExercise.descanso_segundos} segundos
                              </p>
                              <p className="text-muted-foreground leading-relaxed">
                                Es el tiempo que tu coach recomienda esperar entre una serie y la siguiente para recuperarte.
                              </p>
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Botón de notas del coach a demanda (signo de pregunta con popover) */}
                        {currentExercise.comentario && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="h-10 px-2.5 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1 text-xs font-bold transition-all touch-manipulation cursor-pointer"
                                title="Ver notas del coach"
                              >
                                <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-[10px]">?</span>
                                <span className="hidden sm:inline">Notas</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 text-xs p-3 space-y-1.5 bg-popover border border-border shadow-md">
                              <p className="font-bold text-foreground">Indicación del coach:</p>
                              <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                                {currentExercise.comentario}
                              </p>
                            </PopoverContent>
                          </Popover>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setPainModalData({
                              exerciseId: currentExercise.id,
                              exerciseName: currentExercise.nombre,
                              setNumber: serie?.numero_serie || 1,
                            })
                          }
                          className="h-10 w-10 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition-all touch-manipulation cursor-pointer"
                          title="Reportar molestia en este ejercicio"
                          data-testid={`exercise-pain-report-btn-${ejercicio.id}`}
                          aria-label="Reportar molestia en este ejercicio"
                        >
                          <TriangleAlert className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta Única de Serie Actual */}
                  {serie ? (
                    <Card
                      className="border-2 border-primary/40 rounded-3xl p-4 sm:p-5 bg-card/90 shadow-md space-y-4"
                      data-testid={`single-set-card-${currentExercise.id}-${serie.numero_serie}`}
                    >
                      <div className="flex items-center justify-between border-b border-border/60 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
                            Serie {serie.numero_serie} de {currentExercise.series.length}
                          </span>
                          {currentExercise.repeticiones_objetivo && (
                            <span className="text-xs text-muted-foreground font-semibold">
                              Obj: {currentExercise.repeticiones_objetivo}
                            </span>
                          )}
                        </div>

                        {serie.set_type && serie.set_type !== "N" && (
                          <Badge variant="outline" className="font-mono font-bold text-xs">
                            {serie.set_type}
                          </Badge>
                        )}
                      </div>

                      {/* "La última vez" vive en su componente (GOZS-159) */}
                      <div>
                        <UltimaVez
                          ultima={ultimaVez[currentExercise.ejercicio_id ?? currentExercise.id]}
                          numeroSerie={serie.numero_serie}
                          cargando={cargandoUltimaVez}
                        />
                      </div>

                      <SugerenciaCarga
                        sugerencia={sugerencia}
                        vista={isSimpleView ? "SIMPLE" : "TECNICA"}
                        pesoActual={serie.peso_kg}
                        repsActuales={serie.reps_hechas}
                      />

                      {/* Stepper Peso (kg) con input libre y botones configurables */}
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
                            disabled={serie.peso_kg <= 0}
                            onClick={() => handleAdjustPeso(-pasoPeso)}
                            className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-30 touch-manipulation cursor-pointer border border-border/40"
                            aria-label={`Restar ${pasoPeso} kilos`}
                            data-testid="peso-decrement-btn"
                          >
                            −{pasoPeso}
                          </button>
                          <div className="relative h-16 rounded-xl border-2 border-border bg-background flex items-center justify-center focus-within:border-primary transition-colors">
                            <input
                              id={`peso-${currentExercise.id}-${serie.numero_serie}`}
                              type="number"
                              step="any"
                              min="0"
                              value={serie.peso_kg}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                handleDirectUpdatePeso(isNaN(val) ? 0 : val);
                              }}
                              className="w-full h-full bg-transparent text-center font-mono font-extrabold text-3xl sm:text-4xl tabular-nums text-foreground focus:outline-none pr-8"
                              aria-label="Peso en kilogramos"
                            />
                            <span className="absolute right-3 text-sm font-medium text-muted-foreground pointer-events-none">
                              kg
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAdjustPeso(pasoPeso)}
                            className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all touch-manipulation cursor-pointer border border-border/40"
                            aria-label={`Sumar ${pasoPeso} kilos`}
                            data-testid="peso-increment-btn"
                          >
                            +{pasoPeso}
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
                          <div className="relative h-16 rounded-xl border-2 border-border bg-background flex items-center justify-center focus-within:border-primary transition-colors">
                            <input
                              id={`reps-${currentExercise.id}-${serie.numero_serie}`}
                              type="number"
                              step="1"
                              min="1"
                              value={serie.reps_hechas}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                handleDirectUpdateReps(isNaN(val) ? 1 : val);
                              }}
                              className="w-full h-full bg-transparent text-center font-mono font-extrabold text-3xl sm:text-4xl tabular-nums text-foreground focus:outline-none"
                              aria-label="Cantidad de repeticiones"
                            />
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
                                  className={`h-8 px-2.5 rounded-lg text-xs font-bold transition-all ${
                                    serie.set_type === t || (!serie.set_type && t === "N")
                                      ? t === "W"
                                        ? "bg-amber-500 text-white shadow-xs"
                                        : t === "F"
                                        ? "bg-rose-600 text-white shadow-xs"
                                        : t === "D"
                                        ? "bg-purple-600 text-white shadow-xs"
                                        : "bg-primary text-primary-foreground shadow-xs"
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

                      {/* Dots indicadores de progreso de series */}
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
                        {isAllWorkoutCompleted ? "¡Entrenamiento completado!" : "¡Ejercicio completado!"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {isAllWorkoutCompleted
                          ? `Completaste todas las series de tu rutina (${completedSetsCount} de ${totalSets}).`
                          : `Guardaste todas las series de ${currentExercise.nombre}.`}
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
                        <div className="space-y-2 pt-1 w-full max-w-sm mx-auto">
                          <Button
                            type="button"
                            disabled={isFinishing || workoutFinished}
                            onClick={handleTerminarEntrenamiento}
                            className="w-full h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground shadow-lg hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
                            data-testid="terminar-entrenamiento-btn-entrenar-bottom"
                          >
                            <Check className="h-5 w-5" strokeWidth={3} />
                            <span>
                              {isFinishing
                                ? "Guardando entrenamiento…"
                                : workoutFinished
                                ? "¡Entrenamiento finalizado!"
                                : "Terminar y Guardar Entrenamiento"}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setWorkoutTab("registro")}
                            className="text-xs text-muted-foreground hover:text-foreground font-semibold"
                          >
                            Ver Registro de la sesión
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ===================================================================
                SOLAPA 2: REGISTRO DE LA SESIÓN (EDITABLE EN LÍNEA + BORRADO)
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
                                  className="p-3 sm:p-4 bg-secondary/20 space-y-3"
                                  data-testid={`editing-set-container-${ej.id}-${s.numero_serie}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs uppercase tracking-wider text-primary">
                                      Editando Serie {s.numero_serie}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-xs font-semibold text-muted-foreground block">
                                        Peso (kg)
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          disabled={editingSet.pesoKg <= 0}
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              pesoKg: Math.max(0, editingSet.pesoKg - pasoPeso),
                                            })
                                          }
                                          className="h-10 w-10 rounded-lg bg-secondary font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary/80 disabled:opacity-30 touch-manipulation cursor-pointer"
                                        >
                                          −
                                        </button>
                                        <input
                                          type="number"
                                          step="any"
                                          value={editingSet.pesoKg}
                                          onChange={(e) =>
                                            setEditingSet({
                                              ...editingSet,
                                              pesoKg: Math.max(0, parseFloat(e.target.value) || 0),
                                            })
                                          }
                                          className="h-10 flex-1 rounded-lg border border-border bg-background text-center font-mono font-bold text-lg"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              pesoKg: editingSet.pesoKg + pasoPeso,
                                            })
                                          }
                                          className="h-10 w-10 rounded-lg bg-secondary font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary/80 touch-manipulation cursor-pointer"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-xs font-semibold text-muted-foreground block">
                                        Repeticiones
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          disabled={editingSet.reps <= 1}
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              reps: Math.max(1, editingSet.reps - 1),
                                            })
                                          }
                                          className="h-10 w-10 rounded-lg bg-secondary font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary/80 disabled:opacity-30 touch-manipulation cursor-pointer"
                                        >
                                          −
                                        </button>
                                        <input
                                          type="number"
                                          step="1"
                                          value={editingSet.reps}
                                          onChange={(e) =>
                                            setEditingSet({
                                              ...editingSet,
                                              reps: Math.max(1, parseInt(e.target.value, 10) || 1),
                                            })
                                          }
                                          className="h-10 flex-1 rounded-lg border border-border bg-background text-center font-mono font-bold text-lg"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              reps: editingSet.reps + 1,
                                            })
                                          }
                                          className="h-10 w-10 rounded-lg bg-secondary font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary/80 touch-manipulation cursor-pointer"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-end gap-2 pt-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setEditingSet(null)}
                                      className="h-9 px-3 text-xs font-bold"
                                      data-testid="cancel-edit-set-btn"
                                    >
                                      Cancelar
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={handleSaveEdit}
                                      className="h-9 px-3 text-xs font-bold bg-primary text-primary-foreground"
                                      data-testid="save-edit-set-btn"
                                    >
                                      Guardar cambio
                                    </Button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={s.numero_serie}
                                className="flex items-center justify-between p-3 sm:p-4 hover:bg-secondary/10 transition-colors"
                                data-testid={`log-row-${ej.id}-${s.numero_serie}`}
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-semibold text-muted-foreground w-16">
                                      Serie {s.numero_serie}
                                    </span>
                                    <span className="font-mono font-bold text-base sm:text-lg text-foreground">
                                      {s.peso_kg} kg × {s.reps_hechas}
                                    </span>
                                    {seriesRecord.has(`${ej.id}-${s.numero_serie}`) && (
                                      <Trophy className="h-4 w-4 text-warning" aria-label="Récord" />
                                    )}
                                    {!isSimpleView && (
                                      <span className="text-xs text-muted-foreground font-mono">
                                        @RPE {s.rpe_real}
                                      </span>
                                    )}
                                  </div>
                                  <UltimaVez
                                    ultima={ultimaVez[ej.ejercicio_id ?? ej.id]}
                                    numeroSerie={s.numero_serie}
                                    cargando={cargandoUltimaVez}
                                    compacta
                                  />
                                </div>

                                <div className="flex items-center gap-1">
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
                                  <button
                                    type="button"
                                    onClick={() => uncompleteSet(ej.id, s.numero_serie)}
                                    className="h-12 w-12 min-h-12 min-w-12 rounded-xl flex items-center justify-center text-destructive hover:bg-destructive/10 active:scale-95 transition-all touch-manipulation cursor-pointer"
                                    aria-label={`Eliminar serie ${s.numero_serie}`}
                                    data-testid={`delete-set-btn-${ej.id}-${s.numero_serie}`}
                                    title="Eliminar serie"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </CardContent>
                    </Card>
                  ))}

                {completedSetsCount === 0 && (
                  <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">
                      Todavía no guardaste ninguna serie hoy.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWorkoutTab("entrenar")}
                      className="font-bold"
                    >
                      Empezar a entrenar
                    </Button>
                  </div>
                )}

                {completedSetsCount > 0 && (
                  <div className="pt-2 space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                      <span>Todo guardado</span>
                      <span className="font-mono">
                        {completedSetsCount} de {totalSets} series registradas
                      </span>
                    </div>

                    <Button
                      type="button"
                      disabled={isFinishing || workoutFinished}
                      onClick={handleTerminarEntrenamiento}
                      className="w-full h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground shadow-lg hover:brightness-105 active:scale-[0.98] transition-all"
                      data-testid="terminar-entrenamiento-btn"
                    >
                      {isFinishing
                        ? "Guardando entrenamiento…"
                        : workoutFinished
                        ? "¡Entrenamiento finalizado!"
                        : "Terminar entrenamiento"}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Modal de Configuración accesible desde el botón de la cabecera (⚙️) */}
      {isSettingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-5 shadow-xl space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <h2 id="settings-dialog-title" className="text-lg font-bold text-foreground">
                  Configuración de la app
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                aria-label="Cerrar configuración"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Conmutador de Alumno Activo */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                Alumno activo
              </label>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-secondary/40 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExerciseId(null);
                    loadStudentSession("66b92b9a-1ce7-4e2e-a47c-7c5600000000");
                  }}
                  className={`rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                    !currentSession?.studentName?.toLowerCase().includes("gabriel")
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Fernando Rosales
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExerciseId(null);
                    loadStudentSession("0a7a4dfd-e040-4b92-ac29-9507cbb13215");
                  }}
                  className={`rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                    currentSession?.studentName?.toLowerCase().includes("gabriel")
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Gabriel Sánchez (yo, gabi)
                </button>
              </div>
            </div>

            {/* Selector de Nivel de Vista: Minimalista (SIMPLE) vs Técnica (TECNICA) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                Modo de visualización
              </label>
              <div
                className="grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-secondary/40 p-1"
                data-testid="athlete-view-mode-container"
              >
                <button
                  type="button"
                  onClick={() => setNivelVistaAlumno("SIMPLE")}
                  className={`rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
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
                  className={`rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
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
                className="flex items-center justify-between text-xs text-muted-foreground pt-1"
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

            {/* Selector de Incremento de Peso Rápido */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                Paso de incremento de peso (kilos)
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[1.25, 2.5, 5, 10].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setPasoIncrementoPeso(step)}
                    className={`py-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                      pasoPeso === step
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border/60 bg-secondary/30 text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    ±{step} kg
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Define cuánto suman o restan los botones en cada toque (por defecto 2.5 kg).
              </p>
            </div>

            {/* Acceso a Cuestionario Inicial Opcional */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                Perfil del alumno
              </label>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("cuestionario");
                  setIsSettingsOpen(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-border/80 bg-secondary/30 hover:bg-secondary/60 text-xs font-bold text-foreground transition-all cursor-pointer"
                data-testid="tab-cuestionario"
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <span>Cuestionario Inicial</span>
                </div>
                {cuestionarioInicial?.completado_at ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full">
                    Completado
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Opcional</span>
                )}
              </button>
            </div>

            <div className="pt-2">
              <Button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="w-full h-11 rounded-xl font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modales existentes */}
      {videoExercise && (
        <ExerciseVideoModal
          exercise={videoExercise}
          isOpen={Boolean(videoExercise)}
          onClose={() => setVideoExercise(null)}
        />
      )}

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

      {plateModalWeight !== null && (
        <PlateCalculatorModal
          isOpen={plateModalWeight !== null}
          onClose={() => setPlateModalWeight(null)}
          targetWeightKg={plateModalWeight}
        />
      )}

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
              reportPainForSet(painModalData.exerciseId, painModalData.setNumber, report.notasAlumno || "");
              void reportPainEvent(report);
            }
            setPainModalData(null);
          }}
        />
      )}

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
