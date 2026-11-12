"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAthleteStore, type LiveWorkoutExercise, type LiveWorkoutSet, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { calculateEpley1RM, calculateBrzycki1RM, calculateEffectiveVolume } from "@/lib/strength-metrics";
import { ExerciseVideoModal } from "@/components/athlete/exercise-video-modal";
import { ExerciseNotesModal } from "@/components/athlete/exercise-notes-modal";
import { WarmupModal } from "@/components/athlete/warmup-modal";
import { PainReportModal } from "@/components/athlete/pain-report-modal";
import { PainReportBanner } from "@/components/athlete/pain-banner";
import { VideoUploadModal } from "@/components/athlete/video-upload-modal";
import { CuestionarioInicial } from "@/components/athlete/cuestionario-inicial";
import { CierreDiaModal, type RecordSesionItem } from "@/components/athlete/cierre-dia-modal";
import { Tooltip1RM } from "@/components/athlete/tooltip-1rm";
import {
  TriangleAlert,
  Timer,
  Lightbulb,
  Flame,
  Clapperboard,
  Video,
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
  Lock,
  HelpCircle,
  ChevronDown,
} from "@/components/athlete/icons";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useChatStore } from "@/store/use-chat-store";
import { UltimaVez } from "@/components/athlete/ultima-vez";
import { SugerenciaCarga } from "@/components/athlete/sugerencia-carga";
import { AvisoRecord } from "@/components/athlete/aviso-record";
import { sugerirCarga } from "@/lib/sugerencia-carga";
import { esNuevoRecord, type ResultadoRecord } from "@/lib/record-ejercicio";
import { serieDeReferencia } from "@/lib/historial-ejercicio";
import { evaluarPlausibilidadSerie } from "@/lib/plausibilidad-series";
import { playRestTimerAlert, triggerHapticVibration } from "@/lib/sound";
import { parseRepRange, parseTargetRpe } from "@/lib/routine-helpers";
import { isWarmup, isDropset, isWorkingSet, normalizeSerieTipo } from "@/lib/serie-tipo";
// GOZS-275 / GOZS-351: el alumno ya no elige W/N/F/D; el tipo lo fija el constructor.
const MOSTRAR_SELECTOR_MANUAL_TIPO_SERIE = false as boolean;
// GOZS-351: en Vista Técnica se elimina en runtime el bloque de ayuda y el popover de taxonomía W/N/F/D
const MOSTRAR_AYUDA_TAXONOMIA_WNFD = false as boolean;


/** "Biserie A1" (2 ejercicios) o "Circuito A1 · 3 ejercicios" (3 o más). */
function etiquetaGrupoSuperserie(
  ejercicios: { es_superserie?: boolean; grupo_superserie?: number | null }[],
  ej: { grupo_superserie?: number | null }
) {
  const grupo = ej.grupo_superserie || 1;
  const n = ejercicios.filter((e) => e.es_superserie && (e.grupo_superserie || 1) === grupo).length;
  return n > 2 ? `Circuito A${grupo} · ${n} ejercicios` : `Biserie A${grupo}`;
}

/**
 * Determina el siguiente ejercicio en el flujo de entrenamiento en vivo (GOZS-361).
 * - Superseries en circuito Round-Robin: avanza dentro de la ronda entre ejercicios del circuito,
 *   y al completar la ronda avanza a la siguiente ronda soportando series dispares.
 * - Ejercicios individuales / dropset: avanza al siguiente ejercicio incompleto una vez finalizadas sus series.
 */
export function findNextExerciseInWorkout(
  session: LiveWorkoutSession,
  currentExercise: LiveWorkoutExercise,
  completedSetNumber: number
): {
  nextExerciseId: string | null;
  shouldTransition: boolean;
} {
  // 1. Superseries en circuito Round-Robin
  if (currentExercise.es_superserie) {
    const grupo = currentExercise.grupo_superserie ?? 1;
    const groupExercises = session.ejercicios.filter(
      (e) => e.es_superserie && (e.grupo_superserie ?? 1) === grupo
    );
    const currentIndexInGroup = groupExercises.findIndex((e) => e.id === currentExercise.id);

    // Buscar el siguiente ejercicio del circuito en la MISMA ronda (completedSetNumber)
    let nextInRound: LiveWorkoutExercise | null = null;
    for (let i = currentIndexInGroup + 1; i < groupExercises.length; i++) {
      const cand = groupExercises[i];
      if (!cand) continue;
      const candSet = cand.series.find((s) => s.numero_serie === completedSetNumber);
      if (candSet && !candSet.completada) {
        nextInRound = cand;
        break;
      }
    }

    if (nextInRound) {
      return {
        nextExerciseId: nextInRound.id,
        shouldTransition: true,
      };
    }

    // Terminó la ronda 'completedSetNumber'. Buscar la siguiente ronda incompleta en el grupo (soporte de series dispares)
    const maxSetsInGroup = Math.max(...groupExercises.map((e) => e.series.length), 0);
    for (let r = completedSetNumber + 1; r <= maxSetsInGroup; r++) {
      const firstInGroupWithRound = groupExercises.find((e) => {
        const s = e.series.find((set) => set.numero_serie === r);
        return s && !s.completada;
      });
      if (firstInGroupWithRound) {
        return {
          nextExerciseId: firstInGroupWithRound.id,
          shouldTransition: true,
        };
      }
    }

    // Si no quedan más series en el grupo, pasar al siguiente ejercicio fuera de este grupo
    const nextOutside = session.ejercicios.find(
      (ej) =>
        (!ej.es_superserie || (ej.grupo_superserie ?? 1) !== grupo) &&
        ej.series.some((s) => !s.completada)
    );
    if (nextOutside) {
      return {
        nextExerciseId: nextOutside.id,
        shouldTransition: true,
      };
    }

    return { nextExerciseId: null, shouldTransition: false };
  }

  // 2. Ejercicios Individuales o Dropset
  const remainingInExercise = currentExercise.series.filter(
    (s) => !s.completada && s.numero_serie !== completedSetNumber
  );

  if (remainingInExercise.length === 0) {
    const nextIncomplete = session.ejercicios.find(
      (ej) => ej.id !== currentExercise.id && ej.series.some((s) => !s.completada)
    );
    if (nextIncomplete) {
      return {
        nextExerciseId: nextIncomplete.id,
        shouldTransition: true,
      };
    }
  }

  return { nextExerciseId: null, shouldTransition: false };
}

export function LiveWorkout() {
  const {
    currentSession,
    rpeValidationError,
    clearRpeValidationError,
    rpeReminderNotification,
    clearRpeReminderNotification,
    updateSetField,
    updateSetType,
    reportPainForSet,
    attachVideoForSet,
    applyWarmupSetsToExercise,
    registerWarmupSet,
    completeSet,
    uncompleteSet,
    editCompletedSet,
    deleteCompletedSet,
    resetSessionToDefaults,
    nivelVistaAlumno,
    setNivelVistaAlumno,
    vistaElegidaPorAlumno,
    vistaRecomendadaCoach,
    usarVistaRecomendada,
    pasoIncrementoPeso,
    setPasoIncrementoPeso,
    colapsarRutina,
    setColapsarRutina,
    cuestionarioInicial,
    stopProtocolActive,
    setStopProtocolActive,
    activePainBanner,
    clearActivePainBanner,
    reportPainEvent,
    syncSessionToSupabase,
    diaActivoId,
    volverAlInicio,
    marcarDiaCompletado,
    sesionesCompletadas,
    ultimaVez,
    cargandoUltimaVez,
    cargarUltimaVez,
    cargarMiProgreso,
    planAlumno,
    marcas,
    registrarSerieEnMarcas,
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

  // Estado local para expandir la rutina manualmente cuando colapsarRutina está activo
  const [rutinaDesplegadaManual, setRutinaDesplegadaManual] = React.useState(false);

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

  // Estado para highlight visual y transición entre ejercicios (GOZS-361)
  const [highlightedExerciseId, setHighlightedExerciseId] = React.useState<string | null>(null);

  // Estados del temporizador para ejercicios por tiempo (tipo_medicion === 'TIEMPO', GOZS-361)
  const [tiempoCountdown, setTiempoCountdown] = React.useState<number>(0);
  const [timerTiempoActivo, setTimerTiempoActivo] = React.useState<boolean>(false);
  const [timerTiempoPausado, setTimerTiempoPausado] = React.useState<boolean>(false);
  const [timerTiempoCompletado, setTimerTiempoCompletado] = React.useState<boolean>(false);

  const ejecutarTransicionVisual = React.useCallback((exerciseId: string) => {
    setHighlightedExerciseId(exerciseId);
    triggerHapticVibration([60, 40, 60]);
    if (typeof window !== "undefined") {
      setTimeout(() => {
        const el =
          document.getElementById(`exercise-card-${exerciseId}`) ||
          document.querySelector(`[data-testid="single-exercise-container-${exerciseId}"]`) ||
          document.querySelector(`[data-testid="exercise-select-btn-${exerciseId}"]`);
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 50);
      setTimeout(() => {
        setHighlightedExerciseId((prev) => (prev === exerciseId ? null : prev));
      }, 1500);
    }
  }, []);

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

  // Guardas de plausibilidad (GOZS-200)
  const [plausibilityError, setPlausibilityError] = React.useState<string | null>(null);
  const [atypicalPrompt, setAtypicalPrompt] = React.useState<{
    mensaje: string;
    peso: number;
    reps: number;
    isEditing?: boolean;
  } | null>(null);
  const atypicalDialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    if (atypicalPrompt) {
      if (!atypicalDialogRef.current?.open) atypicalDialogRef.current?.showModal();
    } else {
      if (atypicalDialogRef.current?.open) atypicalDialogRef.current?.close();
    }
  }, [atypicalPrompt]);

  // Modal de celebración y estímulo de cierre de día (GOZS-174 / Issue #180)
  const [showCelebrationModal, setShowCelebrationModal] = React.useState(false);
  const [sessionPRs, setSessionPRs] = React.useState<RecordSesionItem[]>([]);
  const sessionStartTimeRef = React.useRef<number>(Date.now());

  // Modales
  const [videoExercise, setVideoExercise] = React.useState<LiveWorkoutExercise | null>(null);
  const [notesExercise, setNotesExercise] = React.useState<LiveWorkoutExercise | null>(null);
  const [warmupModalExercise, setWarmupModalExercise] = React.useState<LiveWorkoutExercise | null>(null);
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
  const rawExercise =
    (selectedExerciseId
      ? currentSession.ejercicios.find((ej) => ej.id === selectedExerciseId)
      : null) ||
    firstIncompleteExercise ||
    currentSession.ejercicios[0];

  const currentSet =
    rawExercise?.series.find((s) => !s.completada) ||
    (rawExercise?.series.length ? rawExercise.series[rawExercise.series.length - 1] : null);

  const currentExercise = rawExercise
    ? {
        ...rawExercise,
        rpe_objetivo: (currentSet && parseTargetRpe(rawExercise.rpe_objetivo, currentSet.numero_serie)) ?? rawExercise.rpe_objetivo,
      }
    : rawExercise;

  const currentExerciseIndex = currentSession.ejercicios.findIndex(
    (ej) => ej.id === currentExercise?.id,
  );

  const { getLatestUnreadStaffMessage, setAthleteChatOpen } = useChatStore();
  const latestUnreadStaffMessage = getLatestUnreadStaffMessage();
  const pendingRpeExercise = currentSession.ejercicios.find(
    (ej) =>
      ej.force_rpe_required &&
      ej.series.some((s) => !s.rpe_real || s.rpe_real < 6 || s.rpe_real > 10),
  );

  // Variable alias `ejercicio` y `serie` requeridas por tests de string matching
  const ejercicio = currentExercise!;
  const serie = currentSet;
  const repRange = currentExercise ? parseRepRange(currentExercise.repeticiones_objetivo) : null;

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

  const tiempoObjetivo =
    currentExercise?.tipo_medicion === "TIEMPO"
      ? (currentExercise.tiempo_objetivo_segundos ??
         (parseInt(currentExercise.repeticiones_objetivo.replace(/\D/g, ""), 10) || 30))
      : 0;

  // Sincronizar temporizador de ejercicio por tiempo al cambiar de ejercicio o de serie (GOZS-361)
  React.useEffect(() => {
    if (currentExercise?.tipo_medicion === "TIEMPO") {
      const t =
        currentExercise.tiempo_objetivo_segundos ??
        (parseInt(currentExercise.repeticiones_objetivo.replace(/\D/g, ""), 10) || 30);
      setTiempoCountdown(t);
      setTimerTiempoActivo(false);
      setTimerTiempoPausado(false);
      setTimerTiempoCompletado(false);
    }
  }, [
    currentExercise?.id,
    currentExercise?.tipo_medicion,
    currentExercise?.tiempo_objetivo_segundos,
    currentExercise?.repeticiones_objetivo,
    serie?.numero_serie,
  ]);

  // Cronómetro regresivo para ejercicios por tiempo con alertas sonoras y hápticas (GOZS-361)
  React.useEffect(() => {
    if (!timerTiempoActivo || timerTiempoPausado) return;

    if (tiempoCountdown <= 0) {
      setTimerTiempoActivo(false);
      setTimerTiempoCompletado(true);
      playRestTimerAlert();
      triggerHapticVibration([300, 150, 300]);
      return;
    }

    const interval = setInterval(() => {
      setTiempoCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerTiempoActivo(false);
          setTimerTiempoCompletado(true);
          playRestTimerAlert();
          triggerHapticVibration([300, 150, 300]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerTiempoActivo, timerTiempoPausado, tiempoCountdown]);

  // Registrar serie actual
  const handleRegistrarSerie = (confirmarAtipica = false) => {
    if (!currentExercise || !currentSet) return;
    setPlausibilityError(null);

    const num = currentSet.numero_serie;
    const peso = currentSet.peso_kg;
    const reps =
      currentExercise.tipo_medicion === "TIEMPO" && (!currentSet.reps_hechas || currentSet.reps_hechas === 0)
        ? tiempoObjetivo
        : currentSet.reps_hechas;
    const setType = currentSet.set_type;
    const ejId = currentExercise.ejercicio_id ?? currentExercise.id;

    if (!confirmarAtipica) {
      const prevPesos: number[] = [];
      if (ultimaVez[ejId]?.series) {
        for (const s of ultimaVez[ejId].series) {
          if (typeof s.peso_kg === "number") prevPesos.push(s.peso_kg);
        }
      }
      for (const s of currentExercise.series) {
        if (s.completada && typeof s.peso_kg === "number" && s.numero_serie !== num) {
          prevPesos.push(s.peso_kg);
        }
      }
      if (prevPesos.length === 0 && marcas[ejId]?.frontera) {
        for (const f of marcas[ejId].frontera) {
          if (typeof f.peso_kg === "number") prevPesos.push(f.peso_kg);
        }
      }

      let ultPeso: number | null = null;
      const prevCompletadasHoy = currentExercise.series.filter(
        (s) => s.completada && s.numero_serie < num,
      );
      if (prevCompletadasHoy.length > 0) {
        ultPeso = prevCompletadasHoy[prevCompletadasHoy.length - 1]!.peso_kg;
      } else if (ultimaVez[ejId]?.series?.length) {
        const ref = serieDeReferencia(ultimaVez[ejId]!, num);
        ultPeso = ref ? ref.peso_kg : ultimaVez[ejId]!.series[ultimaVez[ejId]!.series.length - 1]!.peso_kg;
      } else if (typeof currentSet.last_session_weight_kg === "number" && currentSet.last_session_weight_kg > 0) {
        ultPeso = currentSet.last_session_weight_kg;
      }

      const evalRes = evaluarPlausibilidadSerie({
        peso,
        reps,
        rpe: currentSet.rpe_real,
        historialPesos: prevPesos,
        ultimoPeso: ultPeso,
        musculos: currentExercise.musculos_principales,
        nombreEjercicio: currentExercise.nombre,
      });

      if (evalRes.estado === "bloqueado") {
        setPlausibilityError(evalRes.error);
        return;
      }

      if (evalRes.estado === "requiere_confirmacion") {
        setAtypicalPrompt({
          mensaje: evalRes.mensaje,
          peso: evalRes.peso,
          reps: evalRes.reps,
          isEditing: false,
        });
        return;
      }
    }

    const esAtipica = Boolean(confirmarAtipica);
    const serieCandidata = { peso_kg: peso, reps_hechas: reps, set_type: setType, atipica: esAtipica };
    const resultado = esNuevoRecord(serieCandidata, marcas[ejId] ?? null);

    const isLastSetOfWorkout = completedSetsCount + 1 === totalSets && totalSets > 0;

    completeSet(currentExercise.id, num, esAtipica);
    if (!esAtipica) {
      registrarSerieEnMarcas(ejId, serieCandidata);
    }

    if (resultado.esRecord && !esAtipica) {
      setSeriesRecord((prev) => new Set(prev).add(`${currentExercise.id}-${num}`));
      triggerHapticVibration([60, 40, 60]);
      setOptimisticBanner({
        setNumber: num,
        pesoKg: peso,
        reps,
        record: { resultado, exerciseName: currentExercise.nombre, peso_kg: peso, reps_hechas: reps },
      });
      setSessionPRs((prev) => [
        ...prev.filter(
          (p) => !(p.exerciseName === currentExercise.nombre && p.numero_serie === num)
        ),
        {
          exerciseName: currentExercise.nombre,
          peso_kg: peso,
          reps_hechas: reps,
          tipo: resultado.tipo,
          epley_kg: resultado.epley_kg,
          delta_epley_kg: resultado.delta_epley_kg,
          numero_serie: num,
        },
      ]);
    } else {
      setOptimisticBanner({ setNumber: num, pesoKg: peso, reps });
    }

    if (isLastSetOfWorkout) {
      void handleTerminarEntrenamiento();
    } else {
      const { nextExerciseId, shouldTransition } = findNextExerciseInWorkout(
        currentSession,
        currentExercise,
        num,
      );
      if (nextExerciseId) {
        setSelectedExerciseId(nextExerciseId);
        if (shouldTransition) {
          ejecutarTransicionVisual(nextExerciseId);
        }
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
    if (currentExercise.tipo_medicion === "TIEMPO") {
      const newReps = Math.max(1, currentSet.reps_hechas + delta);
      updateSetField(currentExercise.id, currentSet.numero_serie, "reps_hechas", newReps);
      return;
    }
    const repRange = parseRepRange(currentExercise.repeticiones_objetivo);
    const maxLimit = repRange?.isRange ? repRange.max : Infinity;
    const newReps = Math.min(maxLimit, Math.max(1, currentSet.reps_hechas + delta));
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
    const repRange = parseRepRange(currentExercise.repeticiones_objetivo);
    const maxLimit = repRange?.isRange ? repRange.max : Infinity;
    updateSetField(currentExercise.id, currentSet.numero_serie, "reps_hechas", Math.min(maxLimit, Math.max(0, val)));
  };

  const handleSaveEdit = (confirmarAtipica = false) => {
    if (!editingSet) return;
    setPlausibilityError(null);

    const ej = currentSession.ejercicios.find((e) => e.id === editingSet.exerciseId);
    const ejId = ej?.ejercicio_id ?? editingSet.exerciseId;

    if (!confirmarAtipica) {
      const prevPesos = (ultimaVez[ejId]?.series ?? []).map((s) => s.peso_kg);
      const evalRes = evaluarPlausibilidadSerie({
        peso: editingSet.pesoKg,
        reps: editingSet.reps,
        historialPesos: prevPesos,
        musculos: ej?.musculos_principales,
        nombreEjercicio: ej?.nombre,
      });

      if (evalRes.estado === "bloqueado") {
        setPlausibilityError(evalRes.error);
        return;
      }

      if (evalRes.estado === "requiere_confirmacion") {
        setAtypicalPrompt({
          mensaje: evalRes.mensaje,
          peso: evalRes.peso,
          reps: evalRes.reps,
          isEditing: true,
        });
        return;
      }
    }

    editCompletedSet(
      editingSet.exerciseId,
      editingSet.setNumber,
      editingSet.pesoKg,
      editingSet.reps,
      Boolean(confirmarAtipica),
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
    // Invalidar/recargar miProgreso inmediatamente tras finalizar
    void cargarMiProgreso();
    setIsFinishing(false);
    setWorkoutFinished(true);
    setShowCelebrationModal(true);
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
    <div className="space-y-6 pb-44" data-testid="live-workout-container">
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
            {/* Aviso de error de sincronización offline */}
            {syncError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-xl border border-danger-soft-border bg-danger-soft px-3.5 py-2.5 text-xs font-semibold text-danger-soft-foreground animate-in fade-in duration-200"
                data-testid="sync-error-notice"
              >
                <div className="flex items-center gap-2">
                  <CloudOff className="h-4 w-4 shrink-0 text-destructive" />
                  <span>
                    No pudimos guardar en el servidor. Tus datos siguen en el teléfono.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearSyncError}
                  className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-danger-soft-foreground/70 hover:text-danger-soft-foreground touch-manipulation cursor-pointer"
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

            {/* Cartel de Reporte de Dolor por Rango (GOZS-278) */}
            {activePainBanner && (
              <PainReportBanner
                banner={activePainBanner}
                onDismiss={clearActivePainBanner}
              />
            )}

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

            {/* Banner de Validación de Plausibilidad (GOZS-200) */}
            {plausibilityError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/15 px-3.5 py-2.5 text-xs font-semibold text-destructive animate-in fade-in duration-200"
                data-testid="plausibility-validation-banner"
              >
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />
                  <span>{plausibilityError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPlausibilityError(null)}
                  className="text-destructive/80 hover:text-destructive px-2 touch-manipulation cursor-pointer"
                  aria-label="Descartar aviso de plausibilidad"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Banner de Validación RPE */}
            {rpeValidationError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-xl border border-warning-soft-border bg-warning-soft px-3.5 py-2.5 text-xs font-semibold text-warning-soft-foreground animate-in fade-in duration-200"
                data-testid="rpe-validation-banner"
              >
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-warning-soft-foreground" />
                  <span>{rpeValidationError}</span>
                </div>
                <button
                  type="button"
                  onClick={clearRpeValidationError}
                  className="text-warning-soft-foreground/80 hover:text-warning-soft-foreground px-2 touch-manipulation cursor-pointer"
                  aria-label="Descartar aviso"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Aviso prominente de mensaje no leído del Coach */}
            {latestUnreadStaffMessage && (
              <div
                role="status"
                onClick={() => setAthleteChatOpen(true)}
                className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/15 transition-all p-3 text-xs text-foreground cursor-pointer shadow-xs animate-in fade-in duration-200"
                data-testid="unread-coach-message-banner"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
                    💬
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary">Mensaje del Coach</span>
                      <span className="rounded-full bg-success-soft text-success-soft-foreground border border-success-soft-border px-1.5 py-0.5 text-xs font-bold">
                        No leído
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-md">
                      {latestUnreadStaffMessage.contenido}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAthleteChatOpen(true);
                  }}
                  className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg border border-primary/50 bg-primary/20 hover:bg-primary/30 text-primary transition-colors touch-manipulation min-h-8"
                >
                  Ver mensaje
                </button>
              </div>
            )}

            {/* Recordatorio de RPE obligatorio sin bloqueo */}
            {(rpeReminderNotification || pendingRpeExercise) && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-xl border border-warning-soft-border bg-warning-soft px-3.5 py-2.5 text-xs text-warning-soft-foreground animate-in fade-in duration-200"
                data-testid="rpe-reminder-banner"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-warning-soft-border text-warning-soft-foreground font-bold text-xs">
                    ⚡
                  </span>
                  <div className="min-w-0">
                    <span className="font-bold text-warning-soft-foreground">RPE obligatorio (sin bloqueo):</span>{" "}
                    <span className="text-warning-soft-foreground/90 text-xs">
                      {rpeReminderNotification ||
                        `Tu Coach requiere registrar RPE en "${pendingRpeExercise?.nombre || "ejercicio indicado"}". Podés cargarlo sin detener tu entrenamiento.`}
                    </span>
                  </div>
                </div>
                {pendingRpeExercise && pendingRpeExercise.id !== currentExercise?.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedExerciseId(pendingRpeExercise.id);
                      clearRpeReminderNotification();
                    }}
                    className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-md bg-warning-soft-border hover:bg-warning-soft-border/80 text-warning-soft-foreground transition-colors touch-manipulation cursor-pointer"
                  >
                    Ir al ejercicio
                  </button>
                )}
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
              {/* Cabecera / Conmutador de Rutina en Cascada (GOZS-277) */}
              <div className="flex items-center justify-between px-1 text-xs text-muted-foreground font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="uppercase tracking-wider font-bold">Rutina</span>
                  {colapsarRutina && (
                    <span
                      data-testid="badge-rutina-colapsada"
                      className="text-xs lowercase font-normal px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                    >
                      colapsada ({currentSession.ejercicios.length} ejercicios)
                    </span>
                  )}
                </div>
                {colapsarRutina && (
                  <button
                    type="button"
                    onClick={() => setRutinaDesplegadaManual(!rutinaDesplegadaManual)}
                    data-testid="btn-toggle-rutina-colapsada"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer touch-manipulation py-1"
                    aria-expanded={rutinaDesplegadaManual}
                  >
                    <span>{rutinaDesplegadaManual ? "Colapsar rutina" : `Ver todos (${currentSession.ejercicios.length})`}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${rutinaDesplegadaManual ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>

              {/* Selector de ejercicios en 1 columna completa (Opción B) */}
              <div
                className="flex flex-col gap-1.5"
                data-testid="exercise-selector-column"
                data-rutina-colapsada={colapsarRutina && !rutinaDesplegadaManual ? "true" : "false"}
              >
                {currentSession.ejercicios
                  .filter((ej) => !colapsarRutina || rutinaDesplegadaManual || ej.id === (currentExercise?.id ?? currentSession.ejercicios[0]?.id))
                  .map((ej) => {
                    const idx = currentSession.ejercicios.findIndex((e) => e.id === ej.id);
                    const isSelected = ej.id === currentExercise?.id;
                    const isDone = ej.series.every((s) => s.completada);
                    const completedCount = ej.series.filter((s) => s.completada).length;
                    const isWarmup =
                      ej.tipo_serie === "WARMUP" ||
                      ej.nombre.toLowerCase().includes("warm up") ||
                      ej.nombre.toLowerCase().includes("calentamiento");
                    const isDropSet = ej.tipo_serie === "DROPSET";
                    const isSuperset = Boolean(ej.es_superserie);

                    return (
                      <button
                        key={ej.id}
                        type="button"
                        onClick={() => {
                          setSelectedExerciseId(ej.id);
                          if (colapsarRutina && rutinaDesplegadaManual) {
                            setRutinaDesplegadaManual(false);
                          }
                        }}
                        data-testid={`exercise-select-btn-${ej.id}`}
                        data-highlight={highlightedExerciseId === ej.id ? "true" : undefined}
                        className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border text-left transition-all touch-manipulation cursor-pointer ${
                          highlightedExerciseId === ej.id
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md animate-pulse"
                            : ""
                        } ${
                          isSelected
                            ? isDropSet
                              ? "border-purple-500 bg-purple-500/15 shadow-xs ring-1 ring-purple-500/40"
                              : "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                            : isDone
                            ? "border-success-soft-border bg-success-soft/30 hover:bg-secondary/40"
                            : isDropSet
                            ? "border-purple-500/40 bg-purple-500/5 hover:bg-purple-500/10"
                            : "border-border/70 bg-card hover:bg-secondary/40"
                        }`}
                      >
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 pr-2">
                        {/* Ordinal estilizado a la izquierda */}
                        <div
                          className={`h-6 w-6 rounded-lg text-xs font-mono font-extrabold flex items-center justify-center shrink-0 transition-colors ${
                            isDone
                              ? "bg-success text-success-foreground"
                              : isSelected
                              ? (isDropSet || isSuperset)
                                ? "bg-purple-600 text-white"
                                : "bg-primary text-white"
                              : (isDropSet || isSuperset)
                              ? "bg-purple-500/20 text-purple-300 font-bold"
                              : "bg-secondary/70 text-muted-foreground"
                          }`}
                        >
                          {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : idx + 1}
                        </div>

                        {/* Detalles del ejercicio (nombre completo + meta) */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isWarmup && (
                              <span
                                data-testid={`warmup-tag-${ej.id}`}
                                className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-warning-soft text-warning-soft-foreground border border-warning-soft-border uppercase tracking-wider shrink-0"
                              >
                                Aproximación
                              </span>
                            )}
                            {isDropSet && (
                              <span
                                data-testid={`dropset-tag-${ej.id}`}
                                className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider shrink-0 flex items-center gap-1"
                              >
                                <span>⚡</span> Drop Set
                              </span>
                            )}
                            {isSuperset && (
                              <span
                                data-testid={`superserie-tag-${ej.id}`}
                                className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-800 dark:text-purple-200 border border-purple-500/30 uppercase tracking-wider shrink-0 flex items-center gap-1"
                              >
                                <span>🔗</span> {etiquetaGrupoSuperserie(currentSession.ejercicios, ej)}
                              </span>
                            )}
                            {ej.es_unilateral && (
                              <span
                                data-testid={`badge-unilateral-${ej.id}`}
                                className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-warning-soft text-warning-soft-foreground border border-warning-soft-border uppercase tracking-wider shrink-0"
                              >
                                c/lado
                              </span>
                            )}
                            {ej.tipo_medicion === "TIEMPO" && (
                              <span
                                data-testid={`badge-tiempo-${ej.id}`}
                                className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-neutral-soft text-neutral-soft-foreground border border-neutral-soft-border uppercase tracking-wider shrink-0 inline-flex items-center gap-1"
                              >
                                <Timer className="h-3 w-3" /> Tiempo
                              </span>
                            )}
                            <span
                              className={`text-xs sm:text-sm font-bold leading-tight ${
                                isSelected ? ((isDropSet || isSuperset) ? "text-purple-300 font-extrabold" : "text-primary") : "text-foreground"
                              }`}
                            >
                              {ej.nombre}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {ej.repeticiones_objetivo}
                          </p>
                        </div>
                      </div>

                      {/* Estado a la derecha (sin repetir 'series') */}
                      <div className="shrink-0 flex items-center gap-1 pl-1">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-success-soft-foreground bg-success-soft border border-success-soft-border px-2.5 py-0.5 rounded-full">
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
                <div
                  id={`exercise-card-${currentExercise.id}`}
                  data-testid={`single-exercise-container-${currentExercise.id}`}
                  data-highlight={highlightedExerciseId === currentExercise.id ? "true" : undefined}
                  className={`space-y-4 pt-1 transition-all duration-500 rounded-2xl ${
                    highlightedExerciseId === currentExercise.id
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5 p-2 animate-pulse"
                      : ""
                  }`}
                >
                  {/* Banner de Superserie Conectada (Circuito Violeta) */}
                  {currentExercise.es_superserie && (
                    <div
                      data-testid="superserie-circuit-banner"
                      className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-3.5 py-2.5 text-xs font-semibold text-purple-800 dark:text-purple-200 flex items-center justify-between gap-2 shadow-xs animate-in fade-in"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/20 text-purple-800 dark:text-purple-200 font-bold">A</span>
                        <div>
                          <div className="font-bold text-purple-900 dark:text-purple-100">
                            {etiquetaGrupoSuperserie(currentSession.ejercicios, currentExercise)}
                          </div>
                          <div className="text-xs text-purple-800 dark:text-purple-200">
                            Ejecutar consecutivamente sin descanso previo
                          </div>
                        </div>
                      </div>
                      <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-800 dark:text-purple-200 border border-purple-500/40 shrink-0">
                        Superserie
                      </span>
                    </div>
                  )}

                  {/* Banner de Drop Set definido por el constructor (GOZS-275) */}
                  {currentExercise.tipo_serie === "DROPSET" && (
                    <div
                      data-testid="dropset-banner"
                      className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-3.5 py-2.5 text-xs font-semibold text-purple-300 dark:text-purple-200 flex items-center justify-between gap-2 shadow-xs animate-in fade-in"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300 font-bold">
                          ⚡
                        </span>
                        <div>
                          <div className="font-bold text-purple-200">
                            Ejercicio Drop Set
                          </div>
                          <div className="text-xs text-purple-300/80">
                            Reducción inmediata de peso sin descanso para extender fatiga metabólica
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-purple-500/40 bg-purple-500/20 text-purple-300 uppercase tracking-wider font-bold text-xs px-2 py-0.5"
                        data-testid="dropset-badge"
                      >
                        Drop Set
                      </Badge>
                    </div>
                  )}

                  {/* Encabezado del ejercicio actual */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                      <span>
                        Ejercicio <span className="font-mono">{currentExerciseIndex + 1}</span> de{" "}
                        <span className="font-mono">{currentSession.ejercicios.length}</span>
                      </span>
                      {Boolean(currentExercise.tempo_activo && currentExercise.tempo) && (
                        <span data-testid={`tempo-indicator-${currentExercise.id}`}>
                          Tempo: <span className="font-mono font-bold text-foreground">{currentExercise.tempo}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                            {currentExercise.nombre}
                          </h2>
                          {currentExercise.tipo_serie === "DROPSET" && (
                            <Badge
                              className="bg-purple-600 text-white font-bold text-xs"
                              data-testid="dropset-title-badge"
                            >
                              ⚡ Drop Set
                            </Badge>
                          )}
                          {currentExercise.es_unilateral && (
                            <Badge
                              variant="outline"
                              className="border-warning-soft-border bg-warning-soft text-warning-soft-foreground font-bold text-xs"
                              data-testid="badge-unilateral"
                            >
                              c/lado
                            </Badge>
                          )}
                          {currentExercise.tipo_medicion === "TIEMPO" && (
                            <Badge
                              variant="secondary"
                              className="border border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-bold text-xs inline-flex items-center gap-1"
                              data-testid="badge-tipo-tiempo"
                            >
                              <Timer className="h-3.5 w-3.5" /> {currentExercise.tiempo_objetivo_segundos ?? tiempoObjetivo}s
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {currentExercise.musculos_principales.map((m) => (
                            <span
                              key={m}
                              className="text-xs font-semibold px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground"
                            >
                              {m}
                            </span>
                          ))}
                          {currentExercise.force_rpe_required && (
                            <span
                              data-testid={`force-rpe-badge-${currentExercise.id}`}
                              className="text-xs font-semibold px-2 py-0.5 rounded-md bg-warning-soft text-warning-soft-foreground border border-warning-soft-border inline-flex items-center gap-1"
                            >
                              RPE obligatorio
                            </span>
                          )}
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

                        {Boolean(currentExercise.notas?.trim() || currentExercise.comentario?.trim()) && (
                          <button
                            type="button"
                            onClick={() => setNotesExercise(currentExercise)}
                            className="h-10 px-2.5 rounded-xl border border-border/80 bg-card text-foreground hover:bg-secondary/60 flex items-center gap-1.5 text-xs font-bold transition-all touch-manipulation cursor-pointer"
                            title="Ver notas del ejercicio"
                            data-testid={`exercise-notes-btn-${currentExercise.id}`}
                            aria-label="Ver notas del ejercicio"
                          >
                            <ClipboardList className="h-4 w-4 text-primary" />
                            <span className="hidden sm:inline">Notas</span>
                          </button>
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

                  {/* Bloque dedicado: Series de Calentamiento */}
                  {currentExercise.series.some((s) => isWarmup(s.set_type)) && (
                    <div
                      className="rounded-2xl border border-warning-soft-border bg-warning-soft/30 p-3.5 space-y-2.5"
                      data-testid="warmup-sets-section"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-warning-soft-border text-warning-soft-foreground text-xs">
                            <Flame className="h-3.5 w-3.5 text-warning-soft-foreground" />
                          </span>
                          <h4
                            className="text-xs sm:text-sm font-bold text-warning-soft-foreground uppercase tracking-wider"
                            title="Series de Calentamiento"
                          >
                            Series de Aproximación
                          </h4>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-warning-soft text-warning-soft-foreground font-mono text-xs font-bold"
                          data-testid="warmup-badge"
                          title="Calentamiento (W)"
                        >
                          Aproximación (W)
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {currentExercise.series
                          .filter((s) => isWarmup(s.set_type))
                          .map((ws) => {
                            const isCurrent = serie && serie.numero_serie === ws.numero_serie;
                            return (
                              <div
                                key={ws.numero_serie}
                                className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between transition-all ${
                                  ws.completada
                                    ? "border-success-soft-border bg-success-soft text-success-soft-foreground"
                                    : isCurrent
                                    ? "border-warning bg-warning-soft ring-1 ring-warning shadow-sm"
                                    : "border-border/60 bg-background/60 text-muted-foreground"
                                }`}
                                data-testid={`warmup-set-card-${ws.numero_serie}`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-mono text-xs font-bold text-warning-soft-foreground">
                                    W{ws.numero_serie}
                                  </span>
                                  {ws.completada ? (
                                    <Check className="h-3.5 w-3.5 text-success stroke-[3]" />
                                  ) : isCurrent ? (
                                    <span className="text-xs font-bold text-warning-soft-foreground">Activa</span>
                                  ) : null}
                                </div>
                                <div className="font-bold font-mono text-sm text-foreground">
                                  {ws.peso_kg} <span className="text-xs font-normal text-muted-foreground">kg</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {ws.reps_hechas} reps
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Separador de Series Efectivas si hay calentamiento */}
                  {currentExercise.series.some((s) => isWarmup(s.set_type)) && (
                    <div className="flex items-center justify-between px-1 pt-1" data-testid="effective-sets-section">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Series Efectivas
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {currentExercise.series.filter((s) => isWorkingSet(s.set_type) && s.completada).length} / {currentExercise.series.filter((s) => isWorkingSet(s.set_type)).length}
                      </span>
                    </div>
                  )}

                  {/* Tarjeta Única de Serie Actual */}
                  {serie && !currentExercise.series.every((s) => s.completada) && !isAllWorkoutCompleted && !workoutFinished ? (
                    <Card
                      className={`border-2 rounded-3xl p-4 sm:p-5 bg-card/90 shadow-md space-y-4 ${
                        isDropset(currentExercise.tipo_serie) || isDropset(serie.set_type)
                          ? "border-purple-500/50"
                          : "border-primary/40"
                      }`}
                      data-testid={`single-set-card-${currentExercise.id}-${serie.numero_serie}`}
                    >
                      <div className="flex items-center justify-between border-b border-border/60 pb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                              isWarmup(serie.set_type)
                                ? "text-warning-soft-foreground bg-warning-soft border border-warning-soft-border"
                                : isDropset(currentExercise.tipo_serie) || isDropset(serie.set_type)
                                ? "text-purple-300 bg-purple-500/15 border border-purple-500/30"
                                : "text-primary bg-primary/10"
                            }`}
                          >
                            Serie {serie.numero_serie} de {currentExercise.series.length}
                            {(isDropset(currentExercise.tipo_serie) || isDropset(serie.set_type)) && " · Drop Set"}
                          </span>
                          {currentExercise.repeticiones_objetivo && (
                            <span className="text-xs text-muted-foreground font-semibold">
                              Obj: {currentExercise.repeticiones_objetivo}
                            </span>
                          )}
                        </div>

                        {isWarmup(serie.set_type) ? (
                          <Badge
                            variant="outline"
                            className="font-mono font-bold text-xs border-amber-500/40 bg-warning-soft text-warning-soft-foreground"
                            data-testid="warmup-badge"
                            title="Calentamiento (W)"
                          >
                            Aproximación (W)
                          </Badge>
                        ) : isDropset(currentExercise.tipo_serie) || isDropset(serie.set_type) ? (
                          <Badge
                            variant="outline"
                            className="font-mono font-bold text-xs border-purple-500/40 bg-purple-500/10 text-purple-300"
                            data-testid="dropset-set-badge"
                          >
                            ⚡ Drop Set
                          </Badge>
                        ) : serie.set_type && !["N", "NORMAL"].includes(serie.set_type.toUpperCase().trim()) ? (
                          <Badge variant="outline" className="font-mono font-bold text-xs">
                            {serie.set_type}
                          </Badge>
                        ) : null}
                      </div>

                      {isWarmup(serie.set_type) && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-warning-soft border border-warning-soft-border text-xs text-warning-soft-foreground font-medium">
                          <Flame className="h-4 w-4 shrink-0" />
                          <span>Serie de aproximación: no computa para volumen efectivo ni récord personal (PR).</span>
                        </div>
                      )}

                      {(isDropset(currentExercise.tipo_serie) || isDropset(serie.set_type)) && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 font-medium">
                          <span className="shrink-0 font-bold">⚡</span>
                          <span>Serie Drop Set: reducción inmediata de peso sin pausa previa para fatiga metabólica.</span>
                        </div>
                      )}

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

                      {/* Temporizador para Ejercicios por Tiempo (GOZS-361) */}
                      {currentExercise.tipo_medicion === "TIEMPO" && (
                        <div
                          data-testid="timer-ejercicio-tiempo"
                          className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Timer className="h-5 w-5 text-primary" />
                              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                                Temporizador de Ejercicio ({tiempoObjetivo}s)
                              </span>
                            </div>
                            {timerTiempoCompletado && (
                              <Badge className="bg-success text-success-foreground font-bold text-xs" data-testid="timer-tiempo-completado-badge">
                                ✓ ¡Tiempo completado!
                              </Badge>
                            )}
                          </div>

                          {/* Display gigante de tiempo regresivo */}
                          <div className="flex items-center justify-center py-2">
                            <div
                              className="font-mono text-5xl sm:text-6xl font-black text-foreground tabular-nums tracking-tight"
                              data-testid="timer-tiempo-countdown"
                            >
                              {tiempoCountdown}s
                            </div>
                          </div>

                          {/* Barra de progreso visual */}
                          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary border border-border/50">
                            <div
                              className={`h-full transition-all duration-300 ease-linear rounded-full ${
                                timerTiempoCompletado
                                  ? "bg-success"
                                  : timerTiempoPausado
                                  ? "bg-warning"
                                  : "bg-primary"
                              }`}
                              style={{
                                width: `${
                                  tiempoObjetivo > 0
                                    ? Math.max(0, Math.min(100, ((tiempoObjetivo - tiempoCountdown) / tiempoObjetivo) * 100))
                                    : 100
                                }%`,
                              }}
                            />
                          </div>

                          {/* Controles táctiles */}
                          <div className="flex items-center gap-2 pt-1">
                            {!timerTiempoActivo ? (
                              <Button
                                type="button"
                                onClick={() => {
                                  if (tiempoCountdown === 0) {
                                    setTiempoCountdown(tiempoObjetivo);
                                  }
                                  setTimerTiempoActivo(true);
                                  setTimerTiempoPausado(false);
                                  setTimerTiempoCompletado(false);
                                }}
                                className="flex-1 h-12 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground text-base active:scale-95 transition-all touch-manipulation cursor-pointer"
                                data-testid="timer-tiempo-iniciar-btn"
                              >
                                {tiempoCountdown === 0 || timerTiempoCompletado ? "Reiniciar e Iniciar" : "Iniciar"}
                              </Button>
                            ) : timerTiempoPausado ? (
                              <Button
                                type="button"
                                onClick={() => setTimerTiempoPausado(false)}
                                className="flex-1 h-12 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground text-base active:scale-95 transition-all touch-manipulation cursor-pointer"
                                data-testid="timer-tiempo-reanudar-btn"
                              >
                                ▶ Reanudar
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setTimerTiempoPausado(true)}
                                className="flex-1 h-12 rounded-xl font-bold text-base active:scale-95 transition-all touch-manipulation cursor-pointer"
                                data-testid="timer-tiempo-pausar-btn"
                              >
                                ⏸ Pausar
                              </Button>
                            )}

                            {(timerTiempoActivo || tiempoCountdown !== tiempoObjetivo) && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setTimerTiempoActivo(false);
                                  setTimerTiempoPausado(false);
                                  setTimerTiempoCompletado(false);
                                  setTiempoCountdown(tiempoObjetivo);
                                }}
                                className="h-12 px-4 rounded-xl font-bold text-xs active:scale-95 transition-all touch-manipulation cursor-pointer"
                                data-testid="timer-tiempo-reset-btn"
                              >
                                Reiniciar
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Stepper Peso (kg) con input libre y botones configurables */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor={`peso-${currentExercise.id}-${serie.numero_serie}`}
                            className="text-xs font-bold text-muted-foreground uppercase tracking-wider block"
                          >
                            Peso
                          </label>
                          {currentExercise.es_unilateral && (
                            <span className="text-xs font-bold text-warning-soft-foreground" data-testid="badge-peso-unilateral">
                              c/lado
                            </span>
                          )}
                        </div>
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
                              max="500"
                              inputMode="decimal"
                              value={serie.peso_kg}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  handleDirectUpdatePeso(0);
                                  return;
                                }
                                const val = parseFloat(raw.replace(",", "."));
                                handleDirectUpdatePeso(isNaN(val) ? 0 : val);
                              }}
                              className="w-full h-full bg-transparent text-center font-mono font-extrabold text-3xl sm:text-4xl tabular-nums text-foreground focus:outline-none pr-8 min-h-[44px]"
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

                      {/* Stepper Repeticiones / Tiempo */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <label
                              htmlFor={`reps-${currentExercise.id}-${serie.numero_serie}`}
                              className="text-xs font-bold text-muted-foreground uppercase tracking-wider block"
                            >
                              {currentExercise.tipo_medicion === "TIEMPO" ? "Tiempo (segundos)" : "Repeticiones"}
                            </label>
                            {currentExercise.tipo_medicion !== "TIEMPO" && repRange?.isRange && (
                              <Badge
                                variant="outline"
                                className="font-mono font-semibold text-xs px-2 py-0.5 border-primary/30 bg-primary/10 text-primary"
                                data-testid="rep-range-badge"
                              >
                                {`Rango: ${repRange.min} a ${repRange.max} reps (máx. ${repRange.max})`}
                              </Badge>
                            )}
                          </div>
                          {currentExercise.es_unilateral && (
                            <span className="text-xs font-bold text-warning-soft-foreground flex items-center gap-1" data-testid="unilateral-indicator">
                              (c/lado)
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-[64px_1fr_64px] gap-2 items-center">
                          <button
                            type="button"
                            disabled={serie.reps_hechas <= 1}
                            onClick={() => handleAdjustReps(currentExercise.tipo_medicion === "TIEMPO" ? -5 : -1)}
                            className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-30 touch-manipulation cursor-pointer border border-border/40"
                            aria-label={currentExercise.tipo_medicion === "TIEMPO" ? "Restar 5 segundos" : "Restar 1 repetición"}
                            data-testid="reps-decrement-btn"
                          >
                            {currentExercise.tipo_medicion === "TIEMPO" ? "−5s" : "−1"}
                          </button>
                          <div className="relative h-16 rounded-xl border-2 border-border bg-background flex items-center justify-center focus-within:border-primary transition-colors">
                            <input
                              id={`reps-${currentExercise.id}-${serie.numero_serie}`}
                              type="number"
                              step="1"
                              min="0"
                              max={
                                currentExercise.tipo_medicion === "TIEMPO"
                                  ? "3600"
                                  : repRange?.isRange
                                    ? String(repRange.max)
                                    : "100"
                              }
                              inputMode="numeric"
                              value={serie.reps_hechas}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  handleDirectUpdateReps(0);
                                  return;
                                }
                                const val = parseInt(raw, 10);
                                handleDirectUpdateReps(isNaN(val) ? 0 : val);
                              }}
                              className={`w-full h-full bg-transparent text-center font-mono font-extrabold text-3xl sm:text-4xl tabular-nums text-foreground focus:outline-none min-h-[44px] ${
                                currentExercise.tipo_medicion === "TIEMPO" ? "pr-8" : ""
                              }`}
                              aria-label={currentExercise.tipo_medicion === "TIEMPO" ? "Tiempo en segundos" : "Cantidad de repeticiones"}
                            />
                            {currentExercise.tipo_medicion === "TIEMPO" && (
                              <span className="absolute right-3 text-sm font-medium text-muted-foreground pointer-events-none">
                                s
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={
                              currentExercise.tipo_medicion === "TIEMPO"
                                ? serie.reps_hechas >= 3600
                                : repRange?.isRange
                                  ? serie.reps_hechas >= repRange.max
                                  : serie.reps_hechas >= 100
                            }
                            onClick={() => handleAdjustReps(currentExercise.tipo_medicion === "TIEMPO" ? 5 : 1)}
                            className="h-14 rounded-xl bg-secondary font-mono font-bold text-base text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-30 touch-manipulation cursor-pointer border border-border/40"
                            aria-label={currentExercise.tipo_medicion === "TIEMPO" ? "Sumar 5 segundos" : "Sumar 1 repetición"}
                            data-testid="reps-increment-btn"
                          >
                            {currentExercise.tipo_medicion === "TIEMPO" ? "+5s" : "+1"}
                          </button>
                        </div>
                      </div>

                      {/* EXTRAS EN VISTA TÉCNICA (RPE, W/N/F/D, Calentamiento, Discos, 1RM) */}
                      {!isSimpleView && (
                        <div className="space-y-3 pt-3 border-t border-border/60">
                          {/* Selector Taxonomía W/N/F/D */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Tipo de Serie
                              </span>
                              {/* GOZS-351: Popover de taxonomía W/N/F/D no se renderiza en runtime para el atleta */}
                              {MOSTRAR_AYUDA_TAXONOMIA_WNFD && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:scale-95 transition-all touch-manipulation cursor-pointer"
                                    aria-label="Ayuda sobre tipos de serie"
                                    title="Explicación de tipos de serie (W, N, F, D)"
                                    data-testid="set-type-help-btn"
                                  >
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-72 sm:w-80 p-3.5 z-50 text-xs shadow-xl"
                                  align="start"
                                  data-testid="set-type-popover-content"
                                >
                                  <div className="space-y-2.5">
                                    <div className="font-bold text-popover-foreground flex items-center gap-1.5 border-b border-border pb-1.5">
                                      <HelpCircle className="h-4 w-4 text-primary" />
                                      <span>Taxonomía de Series</span>
                                    </div>
                                    <div className="space-y-2 text-left">
                                      <div className="flex items-start gap-2.5">
                                        <span className="shrink-0 h-5 w-5 rounded-md bg-amber-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                                          W
                                        </span>
                                        <div className="leading-tight">
                                          <p className="font-semibold text-popover-foreground">
                                            W (Warm-up / Calentamiento)
                                          </p>
                                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                            Series de aproximación, no computan al volumen efectivo ni PRs.
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-start gap-2.5">
                                        <span className="shrink-0 h-5 w-5 rounded-md bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shadow-xs">
                                          N
                                        </span>
                                        <div className="leading-tight">
                                          <p className="font-semibold text-popover-foreground">
                                            N (Normal / Efectiva)
                                          </p>
                                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                            Serie de trabajo principal programada por el entrenador.
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-start gap-2.5">
                                        <span className="shrink-0 h-5 w-5 rounded-md bg-rose-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                                          F
                                        </span>
                                        <div className="leading-tight">
                                          <p className="font-semibold text-popover-foreground">
                                            F (Failure / Al Fallo)
                                          </p>
                                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                            Esfuerzo máximo absoluto sin repeticiones en reserva (RIR 0 / RPE 10).
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-start gap-2.5">
                                        <span className="shrink-0 h-5 w-5 rounded-md bg-purple-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                                          D
                                        </span>
                                        <div className="leading-tight">
                                          <p className="font-semibold text-popover-foreground">
                                            D (Drop Set)
                                          </p>
                                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                            Reducción inmediata de peso sin pausa previa para extender la fatiga metabólica.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                              )}
                            </div>
                            {/* Indicador de tipo de serie fijado por el constructor (sin selector manual W/N/F/D para el alumno - GOZS-275) */}
                            {currentExercise.tipo_serie === "DROPSET" ? (
                              <Badge
                                className="bg-purple-600 text-white font-bold text-xs py-1 px-2.5 flex items-center gap-1 shadow-xs"
                                data-testid="fixed-dropset-badge"
                              >
                                <span>⚡</span> Drop Set
                              </Badge>
                            ) : currentExercise.tipo_serie === "WARMUP" || currentExercise.nombre.toLowerCase().includes("warm up") ? (
                              <Badge
                                className="bg-amber-500 text-white font-bold text-xs py-1 px-2.5 flex items-center gap-1 shadow-xs"
                                data-testid="fixed-warmup-badge"
                              >
                                <Flame className="h-3.5 w-3.5" /> Aproximación
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="font-bold text-xs py-1 px-2.5"
                                data-testid="fixed-normal-badge"
                              >
                                Normal
                              </Badge>
                            )}

                            {/* Compatibilidad estática: el selector manual W/N/F/D no se renderiza en runtime (GOZS-275) */}
                            {MOSTRAR_SELECTOR_MANUAL_TIPO_SERIE && (
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
                            )}
                          </div>

                          {/* RPE Objetivo prescrito por el entrenador (Solo lectura) */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                RPE Objetivo
                              </span>
                              <span className="text-xs font-mono font-bold text-primary inline-flex items-center gap-1">
                                <span>{serie.estimated1RM.toFixed(1)} kg 1RM</span>
                                <Tooltip1RM size="sm" />
                              </span>
                            </div>
                            <div
                              className="rounded-xl border border-border/60 bg-secondary/30 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                              data-testid="input-rpe"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-12 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-background font-mono text-2xl font-black text-foreground tabular-nums shadow-2xs">
                                  {currentExercise.rpe_objetivo ?? serie.rpe_real}
                                </div>
                                <div className="space-y-0.5">
                                  <Badge
                                    variant="secondary"
                                    className="inline-flex items-center gap-1.5 border-primary/30 bg-primary/10 text-primary py-0.5 px-2 text-xs font-semibold"
                                    data-testid="rpe-prescribed-badge"
                                  >
                                    <Lock className="h-3 w-3 shrink-0" />
                                    <span>
                                      RPE Objetivo: {currentExercise.rpe_objetivo ?? serie.rpe_real} · Prescrito por entrenador
                                    </span>
                                  </Badge>
                                  <p className="text-xs text-muted-foreground pt-0.5">
                                    Intensidad fija del ejercicio fundamental. Solo lectura para el atleta.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Auxiliar técnico: Aproximación */}
                          <div className="pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full min-h-11 border-warning-soft-border text-warning-soft-foreground hover:bg-warning-soft font-bold text-xs"
                              onClick={() => setWarmupModalExercise(currentExercise)}
                              data-testid={`warmup-btn-${currentExercise.id}`}
                              aria-label="Aproximación"
                              data-button-type="aproximacion"
                            >
                              <Flame className="h-4 w-4" />
                              <span data-testid={`aproximacion-btn-${currentExercise.id}`}>Aproximación</span>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Botón principal de registro de serie */}
                      <button
                        type="button"
                        onClick={() => handleRegistrarSerie(false)}
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
                          const isWarmupSet = isWarmup(s.set_type);
                          return (
                            <span
                              key={s.numero_serie}
                              className={`h-2 rounded-full transition-all duration-200 ${
                                isCurrent
                                  ? isWarmupSet
                                    ? "w-8 bg-warning"
                                    : "w-8 bg-primary"
                                  : isDone
                                  ? isWarmupSet
                                    ? "w-8 bg-warning/70"
                                    : "w-8 bg-success"
                                  : "w-8 bg-muted"
                              }`}
                              title={`Serie ${s.numero_serie}${isWarmupSet ? " (Calentamiento)" : ""}: ${isDone ? "Guardada" : isCurrent ? "Actual" : "Pendiente"}`}
                            />
                          );
                        })}
                      </div>
                    </Card>
                  ) : (
                    <div className="rounded-2xl border border-success-soft-border bg-success-soft p-6 text-center space-y-3">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success text-success-foreground">
                        <Check className="h-6 w-6" strokeWidth={3} />
                      </div>
                      <h3 className="text-xl font-bold text-foreground">
                        {firstIncompleteExercise ? "¡Ejercicio completado!" : "¡Entrenamiento completado!"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {firstIncompleteExercise
                          ? `Guardaste todas las series de ${currentExercise.nombre}.`
                          : "¡Completaste todas las series de tu rutina de hoy!"}
                      </p>
                      {firstIncompleteExercise ? (
                        <Button
                          type="button"
                          onClick={() => {
                            setSelectedExerciseId(firstIncompleteExercise.id);
                            ejecutarTransicionVisual(firstIncompleteExercise.id);
                          }}
                          className="h-12 px-6 rounded-xl font-bold bg-primary text-primary-foreground"
                        >
                          Ir a {firstIncompleteExercise.nombre}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          disabled={isFinishing}
                          onClick={
                            workoutFinished || isAllWorkoutCompleted
                              ? () => setShowCelebrationModal(true)
                              : handleTerminarEntrenamiento
                          }
                          className="w-full h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground shadow-lg hover:brightness-105 active:scale-[0.98] transition-all"
                          data-testid="terminar-entrenamiento-btn-entrenar"
                        >
                          {isFinishing
                            ? "Guardando entrenamiento…"
                            : workoutFinished || isAllWorkoutCompleted
                            ? "¡Entrenamiento finalizado!"
                            : "Terminar entrenamiento"}
                        </Button>
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
                      <CardContent className="p-0">
                        {(() => {
                          const completedWarmups = ej.series.filter(
                            (s) => isWarmup(s.set_type) && s.completada
                          );
                          const completedEffectives = ej.series.filter(
                            (s) => isWorkingSet(s.set_type) && s.completada
                          );

                          const renderLogRow = (s: LiveWorkoutSet, isWarmupRow: boolean) => {
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
                                          className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg bg-secondary font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary/80 disabled:opacity-30 touch-manipulation cursor-pointer"
                                        >
                                          −
                                        </button>
                                        <input
                                          type="number"
                                          step="any"
                                          min="0"
                                          max="500"
                                          inputMode="decimal"
                                          value={editingSet.pesoKg}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const val = parseFloat(raw.replace(",", "."));
                                            setEditingSet({
                                              ...editingSet,
                                              pesoKg: isNaN(val) ? 0 : val,
                                            });
                                          }}
                                          className="h-11 min-h-[44px] flex-1 rounded-lg border border-border bg-background text-center font-mono font-bold text-lg"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              pesoKg: editingSet.pesoKg + pasoPeso,
                                            })
                                          }
                                          className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg bg-secondary font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary/80 touch-manipulation cursor-pointer"
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
                                              reps: Math.max(0, editingSet.reps - 1),
                                            })
                                          }
                                          className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg bg-secondary font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary/80 disabled:opacity-30 touch-manipulation cursor-pointer"
                                        >
                                          −
                                        </button>
                                        <input
                                          type="number"
                                          step="1"
                                          min="0"
                                          max="100"
                                          inputMode="numeric"
                                          value={editingSet.reps}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const val = parseInt(raw, 10);
                                            setEditingSet({
                                              ...editingSet,
                                              reps: isNaN(val) ? 0 : val,
                                            });
                                          }}
                                          className="h-11 min-h-[44px] flex-1 rounded-lg border border-border bg-background text-center font-mono font-bold text-lg"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditingSet({
                                              ...editingSet,
                                              reps: editingSet.reps + 1,
                                            })
                                          }
                                          className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg bg-secondary font-mono font-bold text-sm flex items-center justify-center hover:bg-secondary/80 touch-manipulation cursor-pointer"
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
                                      className="min-h-[44px] px-3 text-xs font-bold"
                                      data-testid="cancel-edit-set-btn"
                                    >
                                      Cancelar
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => handleSaveEdit(false)}
                                      className="min-h-[44px] px-3 text-xs font-bold bg-primary text-primary-foreground"
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
                                className={`flex items-center justify-between p-3 sm:p-4 hover:bg-secondary/10 transition-colors ${
                                  isWarmupRow ? "bg-warning-soft/30" : ""
                                }`}
                                data-testid={`log-row-${ej.id}-${s.numero_serie}`}
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                    <span className="text-xs font-semibold text-muted-foreground w-16">
                                      Serie {s.numero_serie}
                                    </span>
                                    <span className="font-mono font-bold text-base sm:text-lg text-foreground">
                                      {s.peso_kg} kg × {s.reps_hechas}
                                    </span>
                                    {isWarmupRow && (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-500/40 bg-warning-soft text-warning-soft-foreground font-mono text-xs font-bold"
                                        data-testid="warmup-badge"
                                        title="Calentamiento (W)"
                                      >
                                        Aproximación (W)
                                      </Badge>
                                    )}
                                    {(isDropset(s.set_type) || isDropset(ej.tipo_serie)) && (
                                      <Badge
                                        variant="outline"
                                        className="border-purple-500/40 bg-purple-500/10 text-purple-300 font-mono text-xs font-bold"
                                        data-testid="dropset-badge"
                                      >
                                        ⚡ Drop Set
                                      </Badge>
                                    )}
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
                          };

                          return (
                            <div>
                              {completedWarmups.length > 0 && (
                                <div
                                  className="bg-warning-soft/30 border-b border-border/60"
                                  data-testid={`registro-warmup-section-${ej.id}`}
                                >
                                  <div className="px-3 sm:px-4 py-2 flex items-center justify-between bg-warning-soft/50">
                                    <div className="flex items-center gap-1.5">
                                      <Flame className="h-4 w-4 text-warning-soft-foreground" />
                                      <span
                                        className="text-xs font-bold text-warning-soft-foreground uppercase tracking-wider"
                                        title="Series de Calentamiento"
                                      >
                                        Series de Aproximación
                                      </span>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className="border-amber-500/40 bg-warning-soft text-warning-soft-foreground font-mono text-xs font-bold"
                                      data-testid="warmup-badge"
                                      title="Calentamiento (W)"
                                    >
                                      Aproximación (W)
                                    </Badge>
                                  </div>
                                  <div className="divide-y divide-border/40">
                                    {completedWarmups.map((s) => renderLogRow(s, true))}
                                  </div>
                                </div>
                              )}

                              {completedEffectives.length > 0 && (
                                <div data-testid={`registro-effective-section-${ej.id}`}>
                                  {completedWarmups.length > 0 && (
                                    <div className="px-3 sm:px-4 py-2 bg-secondary/30 border-b border-border/40">
                                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                        Series Efectivas
                                      </span>
                                    </div>
                                  )}
                                  <div className="divide-y divide-border/60">
                                    {completedEffectives.map((s) => renderLogRow(s, false))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
                      disabled={isFinishing}
                      onClick={
                        workoutFinished || isAllWorkoutCompleted
                          ? () => setShowCelebrationModal(true)
                          : handleTerminarEntrenamiento
                      }
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
              <p className="text-xs text-muted-foreground">
                Define cuánto suman o restan los botones en cada toque (por defecto 2.5 kg).
              </p>
            </div>

            {/* Toggle de Rutina en Cascada / Colapsada (GOZS-351) */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <label
                    htmlFor="toggle-colapsar-rutina"
                    className="text-xs font-bold text-foreground block cursor-pointer"
                  >
                    Colapsar rutina en cascada
                  </label>
                  <p className="text-xs text-muted-foreground leading-tight">
                    Minimiza los ejercicios mostrando únicamente el activo para llegar más rápido al registro.
                  </p>
                </div>
                <button
                  id="toggle-colapsar-rutina"
                  type="button"
                  role="switch"
                  aria-checked={colapsarRutina}
                  aria-label="Colapsar rutina en cascada"
                  data-testid="toggle-colapsar-rutina"
                  onClick={() => setColapsarRutina(!colapsarRutina)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none touch-manipulation ${
                    colapsarRutina ? "bg-primary" : "bg-secondary"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      colapsarRutina ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
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
                  <span className="text-xs bg-success-soft text-success-soft-foreground border border-success-soft-border font-bold px-2 py-0.5 rounded-full">
                    Completado
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Opcional</span>
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

      {notesExercise && (
        <ExerciseNotesModal
          exercise={notesExercise}
          isOpen={Boolean(notesExercise)}
          onClose={() => setNotesExercise(null)}
        />
      )}

      {warmupModalExercise && (
        <WarmupModal
          isOpen={Boolean(warmupModalExercise)}
          onClose={() => setWarmupModalExercise(null)}
          exerciseName={warmupModalExercise.nombre}
          marcas={marcas[warmupModalExercise.ejercicio_id || warmupModalExercise.id] ?? null}
          rpeObjetivo={warmupModalExercise.rpe_objetivo}
          repsObjetivo={warmupModalExercise.repeticiones_objetivo}
          workingWeightKg={
            warmupModalExercise.series.find(
              (s) => isWorkingSet(s.set_type)
            )?.peso_kg ||
            warmupModalExercise.series[0]?.peso_kg ||
            0
          }
          onApplyWarmupSets={(warmupSets) =>
            applyWarmupSetsToExercise(warmupModalExercise.id, warmupSets)
          }
          onRegisterWarmupSet={(warmupSet) => {
            registerWarmupSet(warmupModalExercise.id, {
              peso_kg: warmupSet.peso_kg,
              reps: warmupSet.reps,
              rpe_real: 6.0,
            });
            setOptimisticBanner({
              setNumber: 1,
              pesoKg: warmupSet.peso_kg,
              reps: warmupSet.reps,
            });
          }}
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

      {/* Modal de celebración y estímulo de cierre de día (GOZS-174 / Issue #180) */}
      <CierreDiaModal
        isOpen={showCelebrationModal}
        onClose={() => setShowCelebrationModal(false)}
        onVolverInicio={() => {
          setShowCelebrationModal(false);
          volverAlInicio();
        }}
        tonelajeKg={totalVolumeKg}
        seriesCompletadas={completedSetsCount}
        totalSeries={totalSets}
        duracionMinutos={Math.max(1, Math.round((Date.now() - sessionStartTimeRef.current) / 60000)) || 45}
        rachaDias={Math.max(1, (sesionesCompletadas?.length || 0) + 1)}
        rachaPrevia={Math.max(0, sesionesCompletadas?.length || 0)}
        metaDiasSemana={planAlumno?.dias?.length || 3}
        diasCompletadosSemana={Math.min(
          planAlumno?.dias?.length || 3,
          Math.max(1, (sesionesCompletadas?.length || 0) + 1)
        )}
        recordsObtenidos={sessionPRs}
        studentName={currentSession.studentName || "Fernando Rosales"}
        diaNombre={cleanDiaTitle || "Día 1"}
      />

      {/* Diálogo HTML5 nativo para confirmación de serie atípica (GOZS-200) */}
      <dialog
        ref={atypicalDialogRef}
        className="fixed inset-0 m-auto z-50 rounded-2xl bg-card p-6 text-card-foreground shadow-2xl backdrop:bg-black/60 max-w-sm w-[90%] border border-border space-y-4"
        data-testid="atypical-confirmation-dialog"
        onClose={() => setAtypicalPrompt(null)}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-warning font-bold text-base">
            <TriangleAlert className="h-5 w-5" />
            <span>Carga atípica</span>
          </div>
          <p className="text-sm font-semibold text-foreground">
            {atypicalPrompt?.mensaje}
          </p>
          <p className="text-xs text-muted-foreground">
            Ingresaste {atypicalPrompt?.peso} kg ({atypicalPrompt?.reps} reps). ¿Deseas confirmarlo como serie atípica o corregir el valor?
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setAtypicalPrompt(null)}
            className="min-h-[44px] px-4 py-2 text-xs font-bold rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-all touch-manipulation cursor-pointer"
            data-testid="atypical-corregir-btn"
          >
            Corregir
          </button>
          <button
            type="button"
            onClick={() => {
              const isEditing = atypicalPrompt?.isEditing;
              setAtypicalPrompt(null);
              if (isEditing) {
                handleSaveEdit(true);
              } else {
                handleRegistrarSerie(true);
              }
            }}
            className="min-h-[44px] px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:brightness-105 active:scale-95 transition-all touch-manipulation cursor-pointer"
            data-testid="atypical-confirmar-btn"
          >
            Confirmar
          </button>
        </div>
      </dialog>
    </div>
  );
}
