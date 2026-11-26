"use client";

import * as React from "react";
import {
  DEFAULT_ATHLETE_ID,
  useAthleteStore,
  type LiveWorkoutExercise,
  type LiveWorkoutSession,
} from "@/store/use-athlete-store";
import { getStorageUser } from "@/lib/user-storage";
import { calculateEffectiveVolume } from "@/lib/strength-metrics";
import { avisoMolestiaPara, ejercicioBloqueado } from "@/lib/athlete/molestias";
import type { RecordSesionItem } from "@/components/athlete/cierre-dia-modal";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useChatStore } from "@/store/use-chat-store";
import { sugerirCarga } from "@/lib/sugerencia-carga";
import { esNuevoRecord, type ResultadoRecord } from "@/lib/record-ejercicio";
import { serieDeReferencia } from "@/lib/historial-ejercicio";
import { evaluarPlausibilidadSerie } from "@/lib/plausibilidad-series";
import { playRestTimerAlert, triggerHapticVibration } from "@/lib/sound";
import { parseRepRange, parseTargetRpe } from "@/lib/routine-helpers";

/** "Biserie A1" (2 ejercicios) o "Circuito A1 · 3 ejercicios" (3 o más). */
export function etiquetaGrupoSuperserie(
  ejercicios: { es_superserie?: boolean; grupo_superserie?: number | null }[],
  ej: { grupo_superserie?: number | null },
) {
  const grupo = ej.grupo_superserie || 1;
  const n = ejercicios.filter((e) => e.es_superserie && (e.grupo_superserie || 1) === grupo).length;
  return n > 2 ? `Circuito A${grupo} · ${n} ejercicios` : `Biserie A${grupo}`;
}

export type UniSide = "D" | "I";
export type UniEntry = { kg: number; reps: number };
export type UniPend = { D: UniEntry | null; I: UniEntry | null };

export type UnilateralStepResult =
  | {
      completed: false;
      nextPend: UniPend;
      nextSide: UniSide;
      toastMensaje: string;
    }
  | {
      completed: true;
      nextPend: UniPend;
      nextSide: "D";
      pair: { D: UniEntry; I: UniEntry };
      payload: { pesoKg: number; reps: number };
    };

/** Resuelve un paso del flujo unilateral sin enviar al store hasta completar ambos lados. */
export function resolverPasoUnilateral(
  uniSide: UniSide,
  uniPend: UniPend,
  entrada: UniEntry,
): UnilateralStepResult {
  const other: UniSide = uniSide === "D" ? "I" : "D";
  const nextPend: UniPend = { ...uniPend, [uniSide]: entrada };
  if (!nextPend[other]) {
    return {
      completed: false,
      nextPend,
      nextSide: other,
      toastMensaje:
        uniSide === "D"
          ? "Derecha registrada. Ahora izquierda."
          : "Izquierda registrada. Ahora derecha.",
    };
  }
  const pair = { D: nextPend.D!, I: nextPend.I! };
  return {
    completed: true,
    nextPend: { D: null, I: null },
    nextSide: "D",
    pair,
    payload: { pesoKg: pair.D.kg, reps: pair.D.reps },
  };
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
  completedSetNumber: number,
): {
  nextExerciseId: string | null;
  shouldTransition: boolean;
} {
  // 1. Superseries en circuito Round-Robin
  if (currentExercise.es_superserie) {
    const grupo = currentExercise.grupo_superserie ?? 1;
    const groupExercises = session.ejercicios.filter(
      (e) => e.es_superserie && (e.grupo_superserie ?? 1) === grupo,
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
        ej.series.some((s) => !s.completada),
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
    (s) => !s.completada && s.numero_serie !== completedSetNumber,
  );

  if (remainingInExercise.length === 0) {
    const nextIncomplete = session.ejercicios.find(
      (ej) => ej.id !== currentExercise.id && ej.series.some((s) => !s.completada),
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

export function useLiveWorkout() {
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
    mostrarTimerDescanso,
    setMostrarTimerDescanso,
    cuestionarioInicial,
    stopProtocolActive,
    setStopProtocolActive,
    reportarMolestia,
    syncSessionToSupabase,
    diaActivoId,
    sessionStartedAt,
    ejercicioAbiertoId,
    setEjercicioAbiertoId,
    setCierreAbierto,
    setCuestionarioAbierto,
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
    seriesRecordIds,
    sessionPRs,
    registrarRecordSesion,
    nombrePreferido,
    guardarNombrePreferido,
    setToastSesion,
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

  // Estado local para expandir la rutina manualmente cuando colapsarRutina está activo
  const [rutinaDesplegadaManual, setRutinaDesplegadaManual] = React.useState(false);

  // Estado para la confirmación optimista de serie guardada
  const [optimisticBanner, setOptimisticBanner] = React.useState<{
    setNumber: number;
    pesoKg: number;
    reps: number;
    record?: { resultado: ResultadoRecord; exerciseName: string; peso_kg: number; reps_hechas: number };
  } | null>(null);

  // Series que resultaron récord en esta sesión (persistidas en store entre pantallas)
  const seriesRecord = React.useMemo(() => new Set(seriesRecordIds), [seriesRecordIds]);

  // Flujo unilateral por lado (D/I) en UI, confirmando 1 sola serie al completar ambos lados
  const [uniSide, setUniSide] = React.useState<"D" | "I">("D");
  const [uniPend, setUniPend] = React.useState<{
    D: { kg: number; reps: number } | null;
    I: { kg: number; reps: number } | null;
  }>({ D: null, I: null });
  const [uniLogs, setUniLogs] = React.useState<
    Record<string, { D: { kg: number; reps: number }; I: { kg: number; reps: number } }>
  >({});

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
  const sessionStartTimeRef = React.useRef<number>(Date.now());

  // Modales
  const [videoExercise, setVideoExercise] = React.useState<LiveWorkoutExercise | null>(null);
  const [notesExercise, setNotesExercise] = React.useState<LiveWorkoutExercise | null>(null);
  const [warmupModalExercise, setWarmupModalExercise] = React.useState<LiveWorkoutExercise | null>(null);
  const [painModalData, setPainModalData] = React.useState<{
    exerciseId: string;
    ejercicioId: string;
    exerciseName: string;
    setNumber: number;
  } | null>(null);
  const [videoUploadModalData, setVideoUploadModalData] = React.useState<{
    exerciseId: string;
    exerciseName: string;
    setNumber: number;
  } | null>(null);

  const { syncError, clearSyncError, isOnline, pendingEvents } = useOfflineQueueStore();

  // Avisar con toast cuando se pierde la señal durante la sesión
  const prevOnlineRef = React.useRef(isOnline);
  React.useEffect(() => {
    if (prevOnlineRef.current && !isOnline) {
      setToastSesion({
        mensaje: "Sin señal. Seguí entrenando: las series quedan en el teléfono.",
        tipo: "neutral",
      });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, setToastSesion]);

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
  const activeExerciseSelection = selectedExerciseId ?? ejercicioAbiertoId;
  const rawExercise =
    (activeExerciseSelection
      ? currentSession.ejercicios.find((ej) => ej.id === activeExerciseSelection)
      : null) ||
    firstIncompleteExercise ||
    currentSession.ejercicios[0];

  const currentSet =
    rawExercise?.series.find((s) => !s.completada) ||
    (rawExercise?.series.length ? rawExercise.series[rawExercise.series.length - 1] : null);

  const currentExercise = rawExercise
    ? {
        ...rawExercise,
        rpe_objetivo:
          (currentSet && parseTargetRpe(rawExercise.rpe_objetivo, currentSet.numero_serie)) ??
          rawExercise.rpe_objetivo,
      }
    : rawExercise;

  const currentExerciseIndex = currentSession.ejercicios.findIndex(
    (ej) => ej.id === currentExercise?.id,
  );

  const avisoMolestia = React.useMemo(() => {
    if (!rawExercise) return null;
    return avisoMolestiaPara(rawExercise, currentSession.molestias ?? []);
  }, [rawExercise, currentSession.molestias]);

  const ejercicioEstaBloqueado = React.useMemo(() => {
    if (!rawExercise) return false;
    return ejercicioBloqueado(rawExercise.id, currentSession.molestias ?? []);
  }, [rawExercise, currentSession.molestias]);

  const { getLatestUnreadPushStaffMessage, setAthleteChatOpen } = useChatStore();
  const sessionStudentId =
    currentSession.studentId && currentSession.studentId !== DEFAULT_ATHLETE_ID
      ? currentSession.studentId
      : undefined;
  const resolvedAlumnoId =
    planAlumno?.alumnos[0]?.id || sessionStudentId || getStorageUser() || undefined;
  const latestUnreadStaffMessage = getLatestUnreadPushStaffMessage(resolvedAlumnoId);
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

  // Precarga la última carga real del alumno (sin incrementar automáticamente) una sola vez por serie
  // pendiente y nunca encima de lo que ya tocó. Así repetir sin cambios no dispara PRs fantasma;
  // la sugerencia de subida queda como acción explícita al tocar el botón.
  const seriesTocadas = React.useRef(new Set<string>());
  const claveSerie = currentExercise && serie ? `${currentExercise.id}-${serie.numero_serie}` : null;
  React.useEffect(() => {
    setUniSide("D");
    setUniPend({ D: null, I: null });
  }, [claveSerie]);
  const ultimaVezActual = currentExercise
    ? ultimaVez[currentExercise.ejercicio_id ?? currentExercise.id]
    : null;
  const refUltimaActual =
    ultimaVezActual && serie ? serieDeReferencia(ultimaVezActual, serie.numero_serie) : null;
  // Al completar la serie N, la N+1 hereda su peso y reps (copia automática); sin serie previa hoy,
  // usa la última vez del ejercicio.
  const serieAnteriorHoy =
    currentExercise && serie
      ? [...currentExercise.series].reverse().find((s) => s.completada && s.numero_serie < serie.numero_serie)
      : undefined;
  const pesoPrecarga = serieAnteriorHoy?.peso_kg ?? refUltimaActual?.peso_kg;
  const repsPrecarga = serieAnteriorHoy?.reps_hechas ?? refUltimaActual?.reps_hechas;
  React.useEffect(() => {
    if (!claveSerie || !currentExercise || !serie || serie.completada) return;
    if (pesoPrecarga === undefined || repsPrecarga === undefined) return;
    if (seriesTocadas.current.has(claveSerie)) return;
    seriesTocadas.current.add(claveSerie);
    updateSetField(currentExercise.id, serie.numero_serie, "peso_kg", pesoPrecarga);
    if (currentExercise.tipo_medicion !== "TIEMPO") {
      updateSetField(currentExercise.id, serie.numero_serie, "reps_hechas", repsPrecarga);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSerie, pesoPrecarga, repsPrecarga]);

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

  const checkPlausibilityBeforeRegister = (peso: number, reps: number, confirmarAtipica: boolean): boolean => {
    if (!currentExercise || !currentSet || confirmarAtipica) return true;
    const num = currentSet.numero_serie;
    const ejId = currentExercise.ejercicio_id ?? currentExercise.id;

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
      return false;
    }

    if (evalRes.estado === "requiere_confirmacion") {
      setAtypicalPrompt({
        mensaje: evalRes.mensaje,
        peso: evalRes.peso,
        reps: evalRes.reps,
        isEditing: false,
      });
      return false;
    }

    return true;
  };

  // Registrar serie actual (con override opcional para payload unilateral)
  const handleRegistrarSerie = (
    confirmarAtipica = false,
    override?: { pesoKg: number; reps: number },
  ) => {
    if (!currentExercise || !currentSet || ejercicioEstaBloqueado) return;
    setPlausibilityError(null);

    const num = currentSet.numero_serie;
    const peso = override ? override.pesoKg : currentSet.peso_kg;
    const reps = override
      ? override.reps
      : currentExercise.tipo_medicion === "TIEMPO" && (!currentSet.reps_hechas || currentSet.reps_hechas === 0)
        ? tiempoObjetivo
        : currentSet.reps_hechas;
    const setType = currentSet.set_type;
    const ejId = currentExercise.ejercicio_id ?? currentExercise.id;

    if (!override && !checkPlausibilityBeforeRegister(peso, reps, confirmarAtipica)) {
      return;
    }

    if (override) {
      updateSetField(currentExercise.id, num, "peso_kg", peso);
      updateSetField(currentExercise.id, num, "reps_hechas", reps);
    }

    const esAtipica = Boolean(confirmarAtipica);
    const serieCandidata = { peso_kg: peso, reps_hechas: reps, set_type: setType, atipica: esAtipica };
    const resultado = esNuevoRecord(serieCandidata, marcas[ejId] ?? null);

    const isLastSetOfWorkout = completedSetsCount + 1 === totalSets && totalSets > 0;

    completeSet(currentExercise.id, num, esAtipica);
    triggerHapticVibration(30);
    if (!esAtipica) {
      registrarSerieEnMarcas(ejId, serieCandidata);
    }

    if (resultado.esRecord && !esAtipica) {
      triggerHapticVibration([60, 40, 60]);
      setOptimisticBanner({
        setNumber: num,
        pesoKg: peso,
        reps,
        record: { resultado, exerciseName: currentExercise.nombre, peso_kg: peso, reps_hechas: reps },
      });
      registrarRecordSesion(`${currentExercise.id}-${num}`, {
        exerciseName: currentExercise.nombre,
        peso_kg: peso,
        reps_hechas: reps,
        tipo: resultado.tipo,
        epley_kg: resultado.epley_kg,
        delta_epley_kg: resultado.delta_epley_kg,
        numero_serie: num,
      });
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
        if (ejercicioAbiertoId !== null) {
          setEjercicioAbiertoId(nextExerciseId);
        }
        if (shouldTransition) {
          ejecutarTransicionVisual(nextExerciseId);
        }
      }

      const nextExObj = nextExerciseId
        ? currentSession.ejercicios.find((e) => e.id === nextExerciseId)
        : undefined;
      const timerActiveNow = useAthleteStore.getState().restTimer.isActive;
      if (resultado.esRecord && !esAtipica) {
        setToastSesion({
          mensaje: `Nuevo récord en ${currentExercise.nombre}`,
          tipo: "rec",
        });
      } else if (
        currentExercise.es_superserie &&
        nextExObj &&
        nextExObj.id !== currentExercise.id &&
        !timerActiveNow
      ) {
        setToastSesion({
          mensaje: `Biserie, sin descanso: ${nextExObj.nombre}`,
          tipo: "neutral",
        });
      } else if (mostrarTimerDescanso === false) {
        const targetName = nextExObj?.nombre ?? currentExercise.nombre;
        const nextSetNum = nextExObj && nextExObj.id !== currentExercise.id ? 1 : num + 1;
        setToastSesion({
          mensaje: `Serie guardada. Sigue: ${targetName} · Serie ${nextSetNum}`,
          tipo: "ok",
        });
      }
    }
  };

  // Flujo unilateral: registra un lado en UI y solo envía 1 serie al store al completar D e I
  const handleRegistrarUnilateral = (confirmarAtipica = false) => {
    if (!currentExercise || !currentSet || ejercicioEstaBloqueado) return;
    setPlausibilityError(null);

    const peso = currentSet.peso_kg;
    const reps = currentSet.reps_hechas;
    if (!checkPlausibilityBeforeRegister(peso, reps, confirmarAtipica)) {
      return;
    }

    const res = resolverPasoUnilateral(uniSide, uniPend, { kg: peso, reps });
    if (!res.completed) {
      setUniPend(res.nextPend);
      setUniSide(res.nextSide);
      setToastSesion({ mensaje: res.toastMensaje, tipo: "ok" });
      return;
    }

    const num = currentSet.numero_serie;
    setUniLogs((prev) => ({
      ...prev,
      [`${currentExercise.id}-${num}`]: res.pair,
    }));
    setUniPend(res.nextPend);
    setUniSide(res.nextSide);
    handleRegistrarSerie(confirmarAtipica, res.payload);
  };

  // Registro unilateral en un paso (mismo peso ambos lados o D/I separados en la misma serie)
  const handleRegistrarParUnilateral = (
    par: { D: UniEntry; I: UniEntry },
    confirmarAtipica = false,
  ) => {
    if (!currentExercise || !currentSet || ejercicioEstaBloqueado) return;
    setPlausibilityError(null);

    const pesoRefMax = Math.max(par.D.kg, par.I.kg);
    const repsRef = par.D.reps;
    if (!checkPlausibilityBeforeRegister(pesoRefMax, repsRef, confirmarAtipica)) {
      return;
    }

    const num = currentSet.numero_serie;
    setUniLogs((prev) => ({
      ...prev,
      [`${currentExercise.id}-${num}`]: par,
    }));
    setUniPend({ D: null, I: null });
    setUniSide("D");
    handleRegistrarSerie(confirmarAtipica, { pesoKg: pesoRefMax, reps: repsRef });
  };

  // Registro unificado de una vuelta completa de Superserie (dispara un único descanso al final del ciclo)
  const handleRegistrarVueltaSuperserie = (
    grupoEjercicios: LiveWorkoutExercise[],
    roundNumber: number,
    entradas: Record<
      string,
      {
        pesoKg: number;
        reps: number;
        parUni?: { D: UniEntry; I: UniEntry };
      }
    >,
  ) => {
    setPlausibilityError(null);
    const pendientes = grupoEjercicios.filter((ex) => {
      if (ejercicioBloqueado(ex.id, currentSession.molestias ?? [])) return false;
      const st = ex.series.find((s) => s.numero_serie === roundNumber);
      return Boolean(st && !st.completada);
    });
    if (pendientes.length === 0) return;

    const nuevosUniLogs: Record<string, { D: UniEntry; I: UniEntry }> = {};
    let huboRecord = false;
    let primerRecordEx = "";

    for (const ex of pendientes) {
      const st = ex.series.find((s) => s.numero_serie === roundNumber);
      if (!st) continue;
      const ent = entradas[ex.id];
      const peso = ent ? ent.pesoKg : st.peso_kg;
      const reps = ent ? ent.reps : st.reps_hechas;
      updateSetField(ex.id, roundNumber, "peso_kg", peso);
      updateSetField(ex.id, roundNumber, "reps_hechas", reps);

      if (ent?.parUni) {
        nuevosUniLogs[`${ex.id}-${roundNumber}`] = ent.parUni;
      }

      const ejId = ex.ejercicio_id ?? ex.id;
      const serieCandidata = { peso_kg: peso, reps_hechas: reps, set_type: st.set_type, atipica: false };
      const resultado = esNuevoRecord(serieCandidata, marcas[ejId] ?? null);

      completeSet(ex.id, roundNumber, false);
      registrarSerieEnMarcas(ejId, serieCandidata);

      if (resultado.esRecord) {
        huboRecord = true;
        if (!primerRecordEx) primerRecordEx = ex.nombre;
        registrarRecordSesion(`${ex.id}-${roundNumber}`, {
          exerciseName: ex.nombre,
          peso_kg: peso,
          reps_hechas: reps,
          tipo: resultado.tipo,
          epley_kg: resultado.epley_kg,
          delta_epley_kg: resultado.delta_epley_kg,
          numero_serie: roundNumber,
        });
      }
    }

    if (Object.keys(nuevosUniLogs).length > 0) {
      setUniLogs((prev) => ({ ...prev, ...nuevosUniLogs }));
    }

    triggerHapticVibration(huboRecord ? [60, 40, 60] : 30);

    const quedaAlgoEnSesion = useAthleteStore
      .getState()
      .currentSession.ejercicios.some((e) => e.series.some((s) => !s.completada));

    if (!quedaAlgoEnSesion) {
      void handleTerminarEntrenamiento();
      return;
    }

    if (huboRecord) {
      setToastSesion({ mensaje: `Nuevo récord en ${primerRecordEx}`, tipo: "rec" });
    } else if (mostrarTimerDescanso === false) {
      setToastSesion({ mensaje: `Vuelta ${roundNumber} guardada.`, tipo: "ok" });
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
    const parsedRepRange = parseRepRange(currentExercise.repeticiones_objetivo);
    const maxLimit = parsedRepRange?.isRange ? parsedRepRange.max : Infinity;
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
    const parsedRepRange = parseRepRange(currentExercise.repeticiones_objetivo);
    const maxLimit = parsedRepRange?.isRange ? parsedRepRange.max : Infinity;
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

  return {
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
    mostrarTimerDescanso,
    setMostrarTimerDescanso,
    cuestionarioInicial,
    stopProtocolActive,
    setStopProtocolActive,
    reportarMolestia,
    syncSessionToSupabase,
    diaActivoId,
    sessionStartedAt,
    ejercicioAbiertoId,
    setEjercicioAbiertoId,
    setCierreAbierto,
    setCuestionarioAbierto,
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
    nombrePreferido,
    guardarNombrePreferido,
    setToastSesion,
    isSimpleView,
    recomendadaTexto,
    tieneVistaDistinta,
    pasoPeso,
    activeTab,
    setActiveTab,
    workoutTab,
    setWorkoutTab,
    isSettingsOpen,
    setIsSettingsOpen,
    rutinaDesplegadaManual,
    setRutinaDesplegadaManual,
    optimisticBanner,
    setOptimisticBanner,
    seriesRecord,
    uniSide,
    setUniSide,
    uniPend,
    uniLogs,
    selectedExerciseId,
    setSelectedExerciseId,
    highlightedExerciseId,
    tiempoCountdown,
    setTiempoCountdown,
    timerTiempoActivo,
    setTimerTiempoActivo,
    timerTiempoPausado,
    setTimerTiempoPausado,
    timerTiempoCompletado,
    setTimerTiempoCompletado,
    editingSet,
    setEditingSet,
    isFinishing,
    workoutFinished,
    plausibilityError,
    setPlausibilityError,
    atypicalPrompt,
    setAtypicalPrompt,
    atypicalDialogRef,
    showCelebrationModal,
    setShowCelebrationModal,
    sessionPRs,
    sessionStartTimeRef,
    videoExercise,
    setVideoExercise,
    notesExercise,
    setNotesExercise,
    warmupModalExercise,
    setWarmupModalExercise,
    painModalData,
    setPainModalData,
    avisoMolestia,
    ejercicioEstaBloqueado,
    stopTimer,
    videoUploadModalData,
    setVideoUploadModalData,
    syncError,
    clearSyncError,
    isOnline,
    pendingEvents,
    totalSets,
    completedSetsCount,
    completedExercisesCount,
    totalExercises,
    progressPercent,
    totalVolumeKg,
    effectiveVolumeKg,
    firstIncompleteExercise,
    currentSet,
    currentExercise,
    currentExerciseIndex,
    latestUnreadStaffMessage,
    setAthleteChatOpen,
    pendingRpeExercise,
    ejercicio,
    serie,
    repRange,
    sugerencia,
    seriesTocadas,
    tiempoObjetivo,
    ejecutarTransicionVisual,
    handleRegistrarSerie,
    handleRegistrarUnilateral,
    handleRegistrarParUnilateral,
    handleRegistrarVueltaSuperserie,
    handleAdjustPeso,
    handleAdjustReps,
    handleDirectUpdatePeso,
    handleDirectUpdateReps,
    handleSaveEdit,
    handleTerminarEntrenamiento,
    cleanDiaTitle,
    isAllWorkoutCompleted,
  };
}
