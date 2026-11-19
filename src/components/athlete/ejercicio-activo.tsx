"use client";

import * as React from "react";
import { ExerciseVideoModal } from "@/components/athlete/exercise-video-modal";
import { ExerciseNotesModal } from "@/components/athlete/exercise-notes-modal";
import { PainReportModal } from "@/components/athlete/pain-report-modal";
import { PainReportBanner } from "@/components/athlete/pain-banner";
import { VideoUploadModal } from "@/components/athlete/video-upload-modal";
import { CierreDiaModal } from "@/components/athlete/cierre-dia-modal";
import { AvisoRecord } from "@/components/athlete/aviso-record";
import { Tooltip1RM } from "@/components/athlete/tooltip-1rm";
import {
  TriangleAlert,
  OctagonAlert,
  X,
  Timer,
  Lightbulb,
  Video,
  ClipboardList,
  Check,
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  Trophy,
  History,
  TrendingUp,
  Equal,
  Info,
  Smartphone,
} from "@/components/athlete/icons";
import { isWarmup, isDropset } from "@/lib/serie-tipo";
import { calcularSeriesAproximacion, esEjercicioAislamiento } from "@/lib/aproximacion-pr";
import { formatearCarga, formatearFechaCorta, serieDeReferencia } from "@/lib/historial-ejercicio";
import { motivoSugerencia, partesTitulo } from "@/lib/sugerencia-carga";
import {
  useLiveWorkout,
  etiquetaGrupoSuperserie,
  findNextExerciseInWorkout,
} from "@/components/athlete/use-live-workout";

export { findNextExerciseInWorkout };

const fmtAr = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const PASOS_RPE = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const BARRAS = [
  { id: "olimpica", label: "Olímpica", kg: 20 },
  { id: "semi", label: "Semi", kg: 15 },
  { id: "ez", label: "EZ", kg: 10 },
  { id: "otra", label: "Otra", kg: null as number | null },
];
const DISCOS = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Parsea un peso ingresado manualmente aceptando punto o coma como separador decimal. */
export function parsearPesoDecimal(raw: string): number {
  const v = parseFloat(raw.trim().replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Discos por lado para una carga total y el peso de la barra (D-21). */
export function discosPorLado(totalKg: number, barraKg: number): { perSide: number; discos: number[]; resto: number } {
  const perSide = (totalKg - barraKg) / 2;
  if (perSide < 0) return { perSide, discos: [], resto: 0 };
  let r = perSide;
  const discos: number[] = [];
  for (const p of DISCOS) {
    while (r >= p - 1e-9) {
      discos.push(p);
      r = Math.round((r - p) * 100) / 100;
    }
  }
  return { perSide, discos, resto: r };
}

function mmss(total: number): string {
  const t = Math.max(0, Math.round(total));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function textoRpe(x: number): string {
  const r = 10 - x;
  if (r <= 0) return `RPE ${fmtAr.format(x)}: no te quedaba ninguna repetición.`;
  if (Number.isInteger(r)) return `RPE ${fmtAr.format(x)}: podías hacer ${r} ${r === 1 ? "repetición" : "repeticiones"} más.`;
  return `RPE ${fmtAr.format(x)}: te quedaban entre ${Math.floor(r)} y ${Math.ceil(r)} repeticiones.`;
}

export function EjercicioActivo() {
  const {
    currentSession,
    updateSetField,
    applyWarmupSetsToExercise,
    registerWarmupSet,
    reportPainForSet,
    attachVideoForSet,
    reportarMolestia,
    isSimpleView,
    pasoPeso,
    setEjercicioAbiertoId,
    setSelectedExerciseId,
    volverAlInicio,
    ultimaVez,
    cargandoUltimaVez,
    sesionesCompletadas,
    planAlumno,
    seriesRecord,
    optimisticBanner,
    setOptimisticBanner,
    stopProtocolActive,
    setStopProtocolActive,
    uniSide,
    setUniSide,
    uniPend,
    uniLogs,
    sessionPRs,
    sessionStartTimeRef,
    sessionStartedAt,
    syncError,
    clearSyncError,
    pendingEvents,
    atypicalPrompt,
    setAtypicalPrompt,
    plausibilityError,
    setPlausibilityError,
    showCelebrationModal,
    setShowCelebrationModal,
    videoExercise,
    setVideoExercise,
    notesExercise,
    setNotesExercise,
    painModalData,
    setPainModalData,
    setDismissedMolestiaId,
    latestMolestia,
    derivedPainBanner,
    videoUploadModalData,
    setVideoUploadModalData,
    tiempoCountdown,
    setTiempoCountdown,
    timerTiempoActivo,
    setTimerTiempoActivo,
    timerTiempoPausado,
    setTimerTiempoPausado,
    timerTiempoCompletado,
    setTimerTiempoCompletado,
    tiempoObjetivo,
    totalSets,
    completedSetsCount,
    totalVolumeKg,
    currentExercise,
    currentExerciseIndex,
    serie,
    repRange,
    sugerencia,
    handleRegistrarSerie,
    handleRegistrarUnilateral,
    handleAdjustPeso,
    handleAdjustReps,
    handleDirectUpdatePeso,
    handleDirectUpdateReps,
    handleSaveEdit,
    handleTerminarEntrenamiento,
    isFinishing,
    cleanDiaTitle,
    isAllWorkoutCompleted,
    firstIncompleteExercise,
    setCierreAbierto,
    setToastSesion,
    nombrePreferido,
  } = useLiveWorkout();

  const [descansoInfo, setDescansoInfo] = React.useState(false);
  const [rpeAyuda, setRpeAyuda] = React.useState(false);
  const [aproxSaltada, setAproxSaltada] = React.useState<Record<string, boolean>>({});
  const [aproxHechasPorEj, setAproxHechasPorEj] = React.useState<Record<string, boolean[]>>({});
  const [barra, setBarra] = React.useState("olimpica");
  const [barraKg, setBarraKg] = React.useState(20);
  const [pesoDraft, setPesoDraft] = React.useState<string | null>(null);
  const [barraDraft, setBarraDraft] = React.useState<string | null>(null);
  const [wakeActivo, setWakeActivo] = React.useState(false);
  const [segundos, setSegundos] = React.useState(0);

  React.useEffect(() => {
    setPesoDraft(null);
  }, [currentExercise?.id, serie?.numero_serie]);

  React.useEffect(() => {
    setCierreAbierto(showCelebrationModal);
    return () => setCierreAbierto(false);
  }, [showCelebrationModal, setCierreAbierto]);

  // Wake Lock (CP7): pantalla activa mientras la sesión está abierta; el chip aparece solo si se concedió.
  React.useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const pedir = async () => {
      try {
        const wl = (navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
        }).wakeLock;
        if (!wl) return;
        const l = await wl.request("screen");
        if (cancelled) {
          void l.release();
          return;
        }
        lock = l;
        setWakeActivo(true);
      } catch {
        setWakeActivo(false);
      }
    };
    void pedir();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !lock) void pedir();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (lock) void lock.release();
      setWakeActivo(false);
    };
  }, []);

  // Cronómetro de sesión.
  React.useEffect(() => {
    if (!sessionStartedAt) return;
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - sessionStartedAt) / 1000)), 1000);
    setSegundos(Math.floor((Date.now() - sessionStartedAt) / 1000));
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  const ej = currentExercise;

  const isSetPendingOffline = React.useCallback(
    (exerciseId: string, setNumber: number) =>
      pendingEvents.some((ev) => {
        if (ev.action !== "WORKOUT_SET_COMPLETED" && ev.action !== "WORKOUT_SET_UPDATED") return false;
        const p = ev.payload as { exerciseId?: string; setNumber?: number; sessionId?: string } | undefined;
        if (!p || p.exerciseId !== exerciseId || p.setNumber !== setNumber) return false;
        return !p.sessionId || p.sessionId === currentSession.id;
      }),
    [pendingEvents, currentSession.id],
  );

  const volver = () => setEjercicioAbiertoId(null);

  if (!ej) return null;

  const esTiempo = ej.tipo_medicion === "TIEMPO";
  const esDrop = isDropset(ej.tipo_serie) || (serie ? isDropset(serie.set_type) : false);
  const esUni = Boolean(ej.es_unilateral);
  const completas = ej.series.every((s) => s.completada);
  const hechas = ej.series.filter((s) => s.completada);
  const tieneNotas = Boolean(ej.notas?.trim() || ej.comentario?.trim());
  const siguiente = firstIncompleteExercise && firstIncompleteExercise.id !== ej.id ? firstIncompleteExercise : null;
  const ultima = ultimaVez[ej.ejercicio_id ?? ej.id];
  const refUltima = ultima && serie ? serieDeReferencia(ultima, serie.numero_serie) : null;
  const pesoRef = refUltima?.peso_kg ?? null;
  const serieAnterior = serie ? [...ej.series].reverse().find((s) => s.completada && s.numero_serie < serie.numero_serie) : undefined;
  const abierta = serie && !completas && !isAllWorkoutCompleted;

  // Aproximación en línea, calculada desde el peso de trabajo (D-20).
  const pesoTrabajo = ej.series.find((s) => !isWarmup(s.set_type))?.peso_kg || serie?.peso_kg || 0;
  const hayW = ej.series.some((s) => isWarmup(s.set_type));
  const mostrarAprox =
    !esTiempo &&
    !esDrop &&
    !esUni &&
    !ej.es_superserie &&
    !esEjercicioAislamiento(ej.nombre) &&
    !hayW &&
    hechas.length === 0 &&
    pesoTrabajo >= 40 &&
    !aproxSaltada[ej.id];
  const filasAprox = mostrarAprox
    ? calcularSeriesAproximacion(pesoTrabajo, {
        rpeObjetivo: typeof ej.rpe_objetivo === "number" ? ej.rpe_objetivo : undefined,
        repeticionesObjetivo: ej.repeticiones_objetivo,
        pesoBarraKg: 20,
      })
    : [];

  const aproxHechas = aproxHechasPorEj[ej.id] ?? [false, false, false, false];
  const displayTiempo =
    !timerTiempoActivo && !timerTiempoPausado && !timerTiempoCompletado && tiempoCountdown === 0
      ? tiempoObjetivo
      : tiempoCountdown;
  const meta = ej.repeticiones_objetivo
    ? esTiempo
      ? `OBJ. ${ej.tiempo_objetivo_segundos ?? tiempoObjetivo} S`
      : `OBJ. ${ej.repeticiones_objetivo}${esUni && !/lado/i.test(ej.repeticiones_objetivo) ? " POR LADO" : ""}`
    : "";

  const pesoWarn = Boolean(atypicalPrompt);

  const t = serie && !isSimpleView ? discosPorLado(serie.peso_kg, barraKg) : null;

  return (
    <div className="a-view" data-testid="live-workout-container">
      <div className="a-wk-head">
        <button
          type="button"
          className="a-back"
          onClick={volver}
          aria-label={`Volver a ${cleanDiaTitle || "la rutina"}`}
          data-testid="volver-a-rutina-btn"
        >
          <ArrowLeft width={18} height={18} className="a-i" /> {cleanDiaTitle || "Rutina"}
        </button>
        <div className="a-tools">
          {tieneNotas && (
            <button
              type="button"
              className="a-tool"
              onClick={() => setNotesExercise(ej)}
              aria-label="Indicaciones del ejercicio"
              data-testid={`exercise-notes-btn-${ej.id}`}
            >
              <ClipboardList width={20} height={20} className="a-i" />
            </button>
          )}
          {ej.url_video && (
            <button
              type="button"
              className="a-tool"
              onClick={() => setVideoExercise(ej)}
              aria-label="Video del ejercicio"
              data-testid={`demo-technique-btn-${ej.id}`}
            >
              <Video width={20} height={20} className="a-i" />
            </button>
          )}
          <button
            type="button"
            className="a-tool a-wide"
            onClick={() => setDescansoInfo((v) => !v)}
            aria-label={`Descanso recomendado: ${ej.descanso_segundos} segundos`}
            aria-expanded={descansoInfo}
            data-testid={`descanso-chip-${ej.id}`}
          >
            <Timer width={18} height={18} className="a-i" />
            <span className="a-t-label">{ej.descanso_segundos} s</span>
          </button>
        </div>
      </div>

      <div className="a-ex-head" data-testid={`single-exercise-container-${ej.id}`}>
        <div className="a-xmeta">
          <span className="a-eb a-t-label" style={{ margin: 0 }}>
            Ejercicio {currentExerciseIndex + 1} de {currentSession.ejercicios.length}
          </span>
          {sessionStartedAt ? (
            <span className="a-chip a-line a-t-label">
              <Timer width={12} height={12} className="a-i" /> {mmss(segundos)}
            </span>
          ) : null}
          {wakeActivo && (
            <span className="a-chip a-line a-t-label" data-testid="chip-pantalla-activa">
              <Lightbulb width={12} height={12} className="a-i" /> Pantalla activa
            </span>
          )}
        </div>
        <h1 className="a-t-h">{ej.nombre}</h1>
        <div className="a-tags">
          {ej.musculos_principales.map((m) => (
            <span key={m} className="a-chip a-t-sec">
              {m}
            </span>
          ))}
          {ej.es_superserie && (
            <span className="a-chip a-ss a-t-label" data-testid="superserie-circuit-banner">
              {etiquetaGrupoSuperserie(currentSession.ejercicios, ej)}
            </span>
          )}
          {esDrop && (
            <span className="a-chip a-ss a-t-label" data-testid="dropset-badge">
              Drop set
            </span>
          )}
          {esUni && (
            <span className="a-chip a-line a-t-label" data-testid="badge-unilateral">
              Por lado
            </span>
          )}
          {esTiempo && (
            <span className="a-chip a-line a-t-label" data-testid="badge-tipo-tiempo">
              <Timer width={12} height={12} className="a-i" /> Tiempo
            </span>
          )}
          {serie && isWarmup(serie.set_type) && (
            <span className="a-chip a-ap a-t-label" data-testid="warmup-badge">
              Aproximación
            </span>
          )}
          {ej.force_rpe_required && (
            <span className="a-chip a-line a-t-label" data-testid={`force-rpe-badge-${ej.id}`}>
              RPE obligatorio
            </span>
          )}
        </div>
      </div>

      {descansoInfo && (
        <div className="a-tip a-t-sec" role="note" data-testid="descanso-popover-content">
          <b>Descanso: {ej.descanso_segundos} s.</b> Es lo que tu coach recomienda entre una serie y la siguiente.
        </div>
      )}

      {syncError && (
        <div className="a-errbar" role="alert" data-testid="sync-error-notice">
          <TriangleAlert width={20} height={20} className="a-i" />
          <span className="a-rt">
            <b className="a-t-bs">No pudimos guardar en el servidor</b>
            <small className="a-t-sec">Tus datos siguen en el teléfono. Se reintenta solo.</small>
          </span>
          <button type="button" onClick={clearSyncError} aria-label="Cerrar aviso de error">
            Cerrar
          </button>
        </div>
      )}

      {plausibilityError && (
        <div className="a-errbar" role="alert" data-testid="plausibility-validation-banner">
          <TriangleAlert width={20} height={20} className="a-i" />
          <span className="a-rt">
            <b className="a-t-bs">{plausibilityError}</b>
          </span>
          <button type="button" onClick={() => setPlausibilityError(null)} aria-label="Cerrar aviso">
            Cerrar
          </button>
        </div>
      )}

      {stopProtocolActive && (
        <div
          role="alert"
          className="rounded-2xl border-2 border-destructive bg-destructive/10 p-4 space-y-2"
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

      {derivedPainBanner && latestMolestia && (
        <PainReportBanner banner={derivedPainBanner} onDismiss={() => setDismissedMolestiaId(latestMolestia.id)} />
      )}

      {filasAprox.length > 0 && (
        <section className="a-card a-appr" aria-label="Aproximación" data-testid="warmup-sets-section">
          <div className="a-appr-h">
            <div>
              <h2 className="a-t-title">Aproximación</h2>
              <span className="a-t-sec a-muted">
                Calculada desde tu peso de trabajo ({fmtAr.format(pesoTrabajo)} kg) · opcional
              </span>
            </div>
            <button
              type="button"
              className="a-link"
              onClick={() => setAproxSaltada((p) => ({ ...p, [ej.id]: true }))}
              data-testid={`warmup-btn-${ej.id}`}
            >
              Saltar
            </button>
          </div>
          {filasAprox.map((a, i) => (
            <div className="a-wrow" key={a.setNumber} data-testid={`warmup-set-card-${a.setNumber}`}>
              <span className="a-w a-t-label">W{a.setNumber}</span>
              <span>
                <b className="a-t-bs">
                  {fmtAr.format(a.peso_kg)} × {a.reps}
                </b>{" "}
                <span className="a-t-sec a-muted">{a.descripcion}</span>
              </span>
              <button
                type="button"
                className={`a-mini ${aproxHechas[i] ? "a-done" : ""}`}
                aria-pressed={aproxHechas[i]}
                onClick={() => {
                  if (aproxHechas[i]) return;
                  registerWarmupSet(ej.id, { peso_kg: a.peso_kg, reps: a.reps, rpe_real: 6.0 });
                  setAproxHechasPorEj((prev) => {
                    const base = prev[ej.id] ?? [false, false, false, false];
                    return { ...prev, [ej.id]: base.map((v, j) => (j === i ? true : v)) };
                  });
                }}
              >
                {aproxHechas[i] ? (
                  <>
                    <Check width={14} height={14} className="a-i" /> Hecha
                  </>
                ) : (
                  "Registrar"
                )}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="a-btn"
            data-testid={`aproximacion-btn-${ej.id}`}
            onClick={() => {
              applyWarmupSetsToExercise(ej.id, filasAprox);
              setAproxSaltada((p) => ({ ...p, [ej.id]: true }));
            }}
          >
            Cargar {filasAprox.length} series
          </button>
        </section>
      )}

      {optimisticBanner?.record && (
        <AvisoRecord
          resultado={optimisticBanner.record.resultado}
          serie={{
            peso_kg: optimisticBanner.record.peso_kg,
            reps_hechas: optimisticBanner.record.reps_hechas,
            set_type: serie?.set_type,
          }}
          nombreEjercicio={optimisticBanner.record.exerciseName}
          tecnica={!isSimpleView}
          onClose={() => setOptimisticBanner(null)}
        />
      )}

      {abierta && esDrop && (
        <p className="a-info a-t-sec" data-testid="dropset-banner">
          <Info width={18} height={18} className="a-i" />
          <span>
            <b>Drop set:</b> al terminar, bajás el peso sin descanso para extender la fatiga.
          </span>
        </p>
      )}

      {abierta ? (
        <section
          className={`a-setcard ${esDrop ? "a-drop" : ""}`}
          aria-label={`Serie ${serie.numero_serie} de ${ej.series.length}`}
          data-testid={`single-set-card-${ej.id}-${serie.numero_serie}`}
        >
          <div className="a-sc-top">
            <span className="a-pill a-t-label">
              Serie {serie.numero_serie} de {ej.series.length}
            </span>
            {meta && <span className="a-t-label a-muted">{meta}</span>}
          </div>

          {refUltima ? (
            <p className="a-last a-t-sec" data-testid="ultima-vez">
              <History width={14} height={14} className="a-i" /> Última vez:{" "}
              <b>{formatearCarga(refUltima)}</b>
              {ultima?.fecha ? ` · ${formatearFechaCorta(ultima.fecha)}` : ""}
            </p>
          ) : cargandoUltimaVez && ultima === undefined ? (
            <p className="a-last a-t-sec" data-testid="ultima-vez-cargando" aria-hidden="true">
              …
            </p>
          ) : (
            <p className="a-last a-t-sec" data-testid="ultima-vez-vacia">
              Primera vez con este ejercicio
            </p>
          )}

          {sugerencia && serie.numero_serie === 1 && (
            <button
              type="button"
              className="a-sug"
              data-testid="sugerencia-carga"
              data-tipo={sugerencia.tipo}
              onClick={() => {
                setPesoDraft(null);
                updateSetField(ej.id, serie.numero_serie, "peso_kg", sugerencia.pesoSugerido);
                updateSetField(ej.id, serie.numero_serie, "reps_hechas", sugerencia.repsSugeridas);
              }}
            >
              <span className="a-sug-ic">
                {sugerencia.tipo === "subir" ? (
                  <TrendingUp width={18} height={18} className="a-i" />
                ) : (
                  <Equal width={18} height={18} className="a-i" />
                )}
              </span>
              <span className="a-rt">
                <b className="a-t-bs">
                  {partesTitulo(sugerencia).prefijo} {partesTitulo(sugerencia).valor}
                </b>
                <small className="a-t-sec">{motivoSugerencia(sugerencia, isSimpleView ? "SIMPLE" : "TECNICA")}</small>
              </span>
            </button>
          )}

          {serieAnterior && !esTiempo && (
            <button
              type="button"
              className="a-repeat"
              data-testid="igual-que-anterior-btn"
              onClick={() => {
                setPesoDraft(null);
                updateSetField(ej.id, serie.numero_serie, "peso_kg", serieAnterior.peso_kg);
                updateSetField(ej.id, serie.numero_serie, "reps_hechas", serieAnterior.reps_hechas);
              }}
            >
              <History width={16} height={16} className="a-i" />
              <span>Igual que la anterior</span>
              <span className="a-t-sec" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {fmtAr.format(serieAnterior.peso_kg)} kg × {serieAnterior.reps_hechas}
              </span>
            </button>
          )}

          {esTiempo && (
            <div className="a-clock" data-testid="timer-ejercicio-tiempo">
              <span className="a-t-label a-muted">Temporizador del ejercicio</span>
              <div className="a-t-ml" data-testid="timer-tiempo-countdown">
                {mmss(displayTiempo)}
              </div>
              {timerTiempoCompletado && (
                <span className="a-chip a-ok a-t-label" data-testid="timer-tiempo-completado-badge">
                  <Check width={12} height={12} className="a-i" /> Tiempo completado
                </span>
              )}
              {!timerTiempoActivo ? (
                <button
                  type="button"
                  className="a-btn a-gym"
                  data-testid="timer-tiempo-iniciar-btn"
                  onClick={() => {
                    if (displayTiempo === 0 || timerTiempoCompletado) setTiempoCountdown(tiempoObjetivo);
                    setTimerTiempoActivo(true);
                    setTimerTiempoPausado(false);
                    setTimerTiempoCompletado(false);
                  }}
                >
                  <Play width={16} height={16} className="a-i" />{" "}
                  {displayTiempo === 0 || timerTiempoCompletado ? "Reiniciar e iniciar" : "Iniciar"}
                </button>
              ) : timerTiempoPausado ? (
                <button
                  type="button"
                  className="a-btn a-gym"
                  data-testid="timer-tiempo-reanudar-btn"
                  onClick={() => setTimerTiempoPausado(false)}
                >
                  <Play width={16} height={16} className="a-i" /> Reanudar
                </button>
              ) : (
                <button
                  type="button"
                  className="a-btn a-gym"
                  data-testid="timer-tiempo-pausar-btn"
                  onClick={() => setTimerTiempoPausado(true)}
                >
                  <Pause width={16} height={16} className="a-i" /> Detener
                </button>
              )}
              {(timerTiempoActivo || displayTiempo !== tiempoObjetivo) && (
                <button
                  type="button"
                  className="a-btn a-ghost"
                  data-testid="timer-tiempo-reset-btn"
                  onClick={() => {
                    setTimerTiempoActivo(false);
                    setTimerTiempoPausado(false);
                    setTimerTiempoCompletado(false);
                    setTiempoCountdown(tiempoObjetivo);
                  }}
                >
                  Reiniciar
                </button>
              )}
            </div>
          )}

          {!esTiempo && (
            <>
              {esUni && (
                <div className="a-seg" role="group" aria-label="Lado" data-testid="unilateral-indicator">
                  <button
                    type="button"
                    aria-pressed={uniSide === "D"}
                    data-testid="uni-side-D"
                    onClick={() => setUniSide("D")}
                  >
                    Derecha {uniPend.D && <Check width={15} height={15} className="a-i" />}
                  </button>
                  <button
                    type="button"
                    aria-pressed={uniSide === "I"}
                    data-testid="uni-side-I"
                    onClick={() => setUniSide("I")}
                  >
                    Izquierda {uniPend.I && <Check width={15} height={15} className="a-i" />}
                  </button>
                </div>
              )}
              <label
                className="a-lbl a-t-label"
                htmlFor={`peso-${ej.id}-${serie.numero_serie}`}
                data-testid={esUni ? "badge-peso-unilateral" : undefined}
              >
                Peso{esUni ? " por lado" : ""}
              </label>
              <div className="a-stepper">
                <button
                  type="button"
                  disabled={serie.peso_kg <= 0}
                  onClick={() => {
                    setPesoDraft(null);
                    handleAdjustPeso(-pasoPeso);
                  }}
                  aria-label={`Restar ${fmtAr.format(pasoPeso)} kg`}
                  data-testid="peso-decrement-btn"
                >
                  −{fmtAr.format(pasoPeso)}
                </button>
                <div className={`a-val ${pesoWarn ? "a-warn" : ""}`}>
                  <input
                    id={`peso-${ej.id}-${serie.numero_serie}`}
                    className="a-t-mi"
                    style={{ ["--n" as string]: String(Math.max(1, (pesoDraft ?? fmtAr.format(serie.peso_kg)).length)) }}
                    type="text"
                    inputMode="decimal"
                    min="0"
                    max="500"
                    autoComplete="off"
                    aria-label="Peso en kilogramos"
                    aria-invalid={pesoWarn || undefined}
                    value={pesoDraft ?? fmtAr.format(serie.peso_kg)}
                    onFocus={() => setPesoDraft(fmtAr.format(serie.peso_kg))}
                    onChange={(e) => {
                      const next = e.target.value;
                      setPesoDraft(next);
                      handleDirectUpdatePeso(parsearPesoDecimal(next));
                    }}
                    onBlur={() => setPesoDraft(null)}
                  />
                  <span className="a-t-sec">kg</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPesoDraft(null);
                    handleAdjustPeso(pasoPeso);
                  }}
                  aria-label={`Sumar ${fmtAr.format(pasoPeso)} kg`}
                  data-testid="peso-increment-btn"
                >
                  +{fmtAr.format(pasoPeso)}
                </button>
              </div>

              {atypicalPrompt && (
                <div className="a-kgwarn" role="alert" id="kgWarn" data-testid="atypical-confirmation-dialog">
                  <b className="a-t-bs" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <TriangleAlert width={16} height={16} className="a-i" /> ¿{fmtAr.format(atypicalPrompt.peso)} kg?
                  </b>
                  <span className="a-t-sec">
                    {atypicalPrompt.mensaje}
                    {pesoRef ? ` (última vez: ${fmtAr.format(pesoRef)} kg)` : ""}
                  </span>
                  <div className="a-two">
                    <button
                      type="button"
                      className="a-mini a-ghost"
                      onClick={() => setAtypicalPrompt(null)}
                      data-testid="atypical-corregir-btn"
                    >
                      Corregir
                    </button>
                    <button
                      type="button"
                      className="a-mini"
                      data-testid="atypical-confirmar-btn"
                      onClick={() => {
                        const editando = atypicalPrompt.isEditing;
                        setAtypicalPrompt(null);
                        if (editando) handleSaveEdit(true);
                        else if (esUni) handleRegistrarUnilateral(true);
                        else handleRegistrarSerie(true);
                      }}
                    >
                      Sí, es correcto
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <label className="a-lbl a-t-label" htmlFor={`reps-${ej.id}-${serie.numero_serie}`}>
            {esTiempo ? "Segundos" : "Repeticiones"}
          </label>
          <div className="a-stepper a-sm">
            <button
              type="button"
              disabled={serie.reps_hechas <= 1}
              onClick={() => handleAdjustReps(esTiempo ? -5 : -1)}
              aria-label={esTiempo ? "Restar 5 segundos" : "Restar una repetición"}
              data-testid="reps-decrement-btn"
            >
              {esTiempo ? "−5" : "−1"}
            </button>
            <div className="a-val">
              <input
                id={`reps-${ej.id}-${serie.numero_serie}`}
                className="a-t-mi"
                style={{ ["--n" as string]: String(serie.reps_hechas).length }}
                type="text"
                inputMode="numeric"
                min="0"
                max={!esTiempo && repRange?.isRange ? repRange.max : 100}
                autoComplete="off"
                aria-label={esTiempo ? "Tiempo en segundos" : "Cantidad de repeticiones"}
                value={serie.reps_hechas}
                onChange={(e) => {
                  const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  handleDirectUpdateReps(Number.isNaN(v) ? 0 : v);
                }}
              />
              <span className="a-t-sec">{esTiempo ? "s" : "reps"}</span>
            </div>
            <button
              type="button"
              disabled={!esTiempo && repRange?.isRange ? serie.reps_hechas >= repRange.max : false}
              onClick={() => handleAdjustReps(esTiempo ? 5 : 1)}
              aria-label={esTiempo ? "Sumar 5 segundos" : "Sumar una repetición"}
              data-testid="reps-increment-btn"
            >
              {esTiempo ? "+5" : "+1"}
            </button>
          </div>

          {!esTiempo && repRange?.isRange && (
            <small className="a-t-sec a-muted" data-testid="rep-range-badge">
              Rango: {repRange.min} a {repRange.max} reps (máx. {repRange.max})
            </small>
          )}

          {!isSimpleView && !esTiempo && (
            <div className="a-tec" data-testid="vista-tecnica">
              <div className="a-kv">
                <span className="a-t-label a-muted">Tipo de serie</span>
                <span
                  className="a-chip a-t-label"
                  data-testid={
                    esDrop
                      ? "fixed-dropset-badge"
                      : isWarmup(serie.set_type)
                        ? "fixed-warmup-badge"
                        : "fixed-normal-badge"
                  }
                >
                  {esDrop ? "Drop set" : isWarmup(serie.set_type) ? "Aproximación" : "Normal"}
                </span>
              </div>
              <div className="a-kv" data-testid="input-rpe">
                <span className="a-t-label a-muted">RPE objetivo</span>
                <span className="a-t-sec" data-testid="rpe-prescribed-badge">
                  <b>{ej.rpe_objetivo ?? serie.rpe_real}</b> · lo prescribe tu coach
                </span>
              </div>
              <div className="a-kv">
                <span className="a-t-label a-muted">1RM estimado</span>
                <span className="a-t-sec">
                  <b>{Math.round(serie.estimated1RM)} kg</b> <Tooltip1RM size="sm" />
                </span>
              </div>
              <div className="a-lblrow">
                <span className="a-t-label a-muted">Tu RPE</span>
                <button
                  type="button"
                  className="a-q"
                  aria-label="Qué es RPE"
                  aria-expanded={rpeAyuda}
                  onClick={() => setRpeAyuda((v) => !v)}
                >
                  ?
                </button>
              </div>
              {rpeAyuda && <div className="a-tip a-t-sec">{textoRpe(serie.rpe_real)}</div>}
              <div className="a-rpe-row" role="group" aria-label="Tu RPE">
                {PASOS_RPE.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={serie.rpe_real === v}
                    onClick={() => updateSetField(ej.id, serie.numero_serie, "rpe_real", v)}
                  >
                    {fmtAr.format(v)}
                  </button>
                ))}
              </div>
              <span className="a-t-label a-muted">Barra</span>
              <div className="a-seg a-stack" role="group" aria-label="Tipo de barra">
                {BARRAS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={barra === b.id}
                    onClick={() => {
                      setBarra(b.id);
                      setBarraDraft(null);
                      if (b.kg != null) setBarraKg(b.kg);
                    }}
                  >
                    <span>{b.label}</span>
                    <small>{b.kg != null ? `${b.kg} kg` : "a medida"}</small>
                  </button>
                ))}
              </div>
              {barra === "otra" && (
                <label className="a-barkg a-t-sec" htmlFor="barIn">
                  Peso de la barra{" "}
                  <input
                    id="barIn"
                    inputMode="decimal"
                    value={barraDraft ?? fmtAr.format(barraKg)}
                    onFocus={() => setBarraDraft(fmtAr.format(barraKg))}
                    onChange={(e) => {
                      const next = e.target.value;
                      setBarraDraft(next);
                      setBarraKg(parsearPesoDecimal(next));
                    }}
                    onBlur={() => setBarraDraft(null)}
                  />{" "}
                  kg
                </label>
              )}
              {t && (
                <div className="a-plates" style={{ display: "grid", gap: 6 }}>
                  <span className="a-t-label a-muted">Carga por lado</span>
                  <span className="a-t-mm">
                    {t.perSide >= 0 ? fmtAr.format(t.perSide) : "—"} <span className="a-t-sec a-muted">kg</span>
                  </span>
                  {t.discos.length > 0 && (
                    <div className="a-pchips" aria-label="Discos por lado">
                      {t.discos.map((p, i) => (
                        <span key={i} className={`a-pchip a-t-label ${p >= 10 ? "a-big" : ""}`}>
                          {fmtAr.format(p)}
                        </span>
                      ))}
                    </div>
                  )}
                  {t.perSide < 0 && <small className="a-t-sec a-muted">El peso es menor que la barra.</small>}
                  {t.resto > 0.01 && (
                    <small className="a-t-sec a-muted">Quedan {fmtAr.format(t.resto)} kg sin disco exacto.</small>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="a-btn a-gym"
            onClick={() => (esUni ? handleRegistrarUnilateral(false) : handleRegistrarSerie(false))}
            data-testid="registrar-serie-btn"
          >
            <Check width={18} height={18} className="a-i" />{" "}
            {esTiempo
              ? `Registrar ${serie.reps_hechas} s`
              : esDrop
                ? `Registrar drop ${serie.numero_serie}`
                : esUni
                  ? `Registrar ${uniSide === "D" ? "derecha" : "izquierda"}`
                  : `Registrar serie ${serie.numero_serie}`}
          </button>

          <div className="a-pagedots" aria-hidden="true">
            {ej.series.map((s) => (
              <i key={s.numero_serie} className={s.completada || s.numero_serie === serie.numero_serie ? "a-on" : ""} />
            ))}
          </div>
        </section>
      ) : (
        <section className="a-card a-donecard">
          <b className="a-t-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Check width={20} height={20} className="a-i" /> Ejercicio completo
          </b>
          <span className="a-t-sec a-muted">
            {ej.series.length} {ej.series.length === 1 ? "serie registrada" : "series registradas"}.
          </span>
          {siguiente ? (
            <button
              type="button"
              className="a-btn a-gym"
              onClick={() => {
                setSelectedExerciseId(siguiente.id);
                setEjercicioAbiertoId(siguiente.id);
              }}
            >
              Siguiente: {siguiente.nombre} <ArrowRight width={18} height={18} className="a-i" />
            </button>
          ) : (
            <button
              type="button"
              className="a-btn a-gym"
              disabled={isFinishing}
              onClick={isAllWorkoutCompleted ? () => setShowCelebrationModal(true) : handleTerminarEntrenamiento}
              data-testid="terminar-entrenamiento-btn-entrenar"
            >
              {isFinishing ? "Guardando…" : "Terminar sesión"}
            </button>
          )}
        </section>
      )}

      <button
        type="button"
        className="a-molbtn"
        data-testid={`exercise-pain-report-btn-${ej.id}`}
        onClick={() =>
          setPainModalData({
            exerciseId: ej.id,
            ejercicioId: ej.ejercicio_id || "",
            exerciseName: ej.nombre,
            setNumber: serie?.numero_serie || 1,
          })
        }
      >
        <TriangleAlert width={18} height={18} className="a-i" /> Tengo una molestia
      </button>

      {hechas.length > 0 && (
        <>
          <p className="a-eb a-t-label">Registradas</p>
          <ol className="a-logged" data-testid="registradas">
            {hechas.map((s) => {
              const pendiente = isSetPendingOffline(ej.id, s.numero_serie);
              const uniPar = esUni ? uniLogs[`${ej.id}-${s.numero_serie}`] : undefined;
              return (
                <li key={s.numero_serie} data-testid={`log-row-${ej.id}-${s.numero_serie}`}>
                  <span className="a-t-sec">
                    <b>Serie {s.numero_serie}</b> ·{" "}
                    {esTiempo
                      ? `${s.reps_hechas} s`
                      : esUni
                        ? uniPar
                          ? `D ${fmtAr.format(uniPar.D.kg)}×${uniPar.D.reps} · I ${fmtAr.format(uniPar.I.kg)}×${uniPar.I.reps}`
                          : `D ${fmtAr.format(s.peso_kg)}×${s.reps_hechas} · I ${fmtAr.format(s.peso_kg)}×${s.reps_hechas}`
                        : `${fmtAr.format(s.peso_kg)} kg × ${s.reps_hechas}`}
                    {!isSimpleView && s.rpe_real && !esTiempo ? ` · RPE ${fmtAr.format(s.rpe_real)}` : ""}
                  </span>
                  {seriesRecord.has(`${ej.id}-${s.numero_serie}`) && (
                    <span className="a-chip a-pr a-t-label">
                      <Trophy width={11} height={11} className="a-i" /> PR
                    </span>
                  )}
                  <span className="a-stt a-t-sec" data-testid={pendiente ? "serie-en-telefono" : "serie-guardada"}>
                    {pendiente ? (
                      <>
                        <Smartphone width={13} height={13} className="a-i" /> En el teléfono
                      </>
                    ) : (
                      <>
                        <Check width={13} height={13} className="a-i" /> Guardada
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {videoExercise && (
        <ExerciseVideoModal exercise={videoExercise} isOpen onClose={() => setVideoExercise(null)} />
      )}
      {notesExercise && (
        <ExerciseNotesModal exercise={notesExercise} isOpen onClose={() => setNotesExercise(null)} />
      )}
      {painModalData && (
        <PainReportModal
          isOpen
          onClose={() => setPainModalData(null)}
          exerciseName={painModalData.exerciseName}
          exerciseId={painModalData.exerciseId}
          ejercicioId={painModalData.ejercicioId}
          setNumber={painModalData.setNumber}
          ejercicios={currentSession.ejercicios}
          onSavePainReport={(report) => {
            if (typeof report === "string") {
              reportPainForSet(painModalData.exerciseId, painModalData.setNumber, report);
            } else {
              const targetExerciseId = report.exerciseId || painModalData.exerciseId;
              void reportarMolestia({
                ejercicioEnRutinaId: targetExerciseId,
                ejercicioId: report.ejercicioId || painModalData.ejercicioId || targetExerciseId,
                numeroSerie: report.setNumber ?? painModalData.setNumber,
                zona: report.zonaArticular,
                eva: report.intensidadNumerica,
                sintomas: report.sintomasAlarma,
                momento: report.momentoAparicion,
                notas: report.notasAlumno,
              });
            }
            setPainModalData(null);
          }}
        />
      )}
      {videoUploadModalData && (
        <VideoUploadModal
          isOpen
          onClose={() => setVideoUploadModalData(null)}
          exerciseName={videoUploadModalData.exerciseName}
          setNumber={videoUploadModalData.setNumber}
          onSaveVideoUrl={(url) =>
            attachVideoForSet(videoUploadModalData.exerciseId, videoUploadModalData.setNumber, url)
          }
        />
      )}
      <CierreDiaModal
        isOpen={showCelebrationModal}
        onClose={() => {
          setShowCelebrationModal(false);
          setCierreAbierto(false);
        }}
        onVolverInicio={() => {
          setShowCelebrationModal(false);
          setCierreAbierto(false);
          volverAlInicio();
          setToastSesion(
            completedSetsCount > 0
              ? { mensaje: "Sesión guardada en tu historial", tipo: "ok", irAHistorial: true }
              : { mensaje: "Sesión cerrada sin series", tipo: "neutral", irAHistorial: false },
          );
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
          Math.max(1, (sesionesCompletadas?.length || 0) + 1),
        )}
        recordsObtenidos={sessionPRs}
        studentName={currentSession.studentName}
        nombrePreferido={nombrePreferido}
        diaNombre={cleanDiaTitle || "DÍA 1"}
      />
    </div>
  );
}
