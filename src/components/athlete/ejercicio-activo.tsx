"use client";

import * as React from "react";
import { ExerciseVideoModal } from "@/components/athlete/exercise-video-modal";
import { ExerciseNotesModal } from "@/components/athlete/exercise-notes-modal";
import { PainReportModal } from "@/components/athlete/pain-report-modal";
import { AvisoMolestia } from "@/components/athlete/aviso-molestia";
import { VideoUploadModal } from "@/components/athlete/video-upload-modal";
import { CierreDiaModal } from "@/components/athlete/cierre-dia-modal";
import { AvisoRecord } from "@/components/athlete/aviso-record";
import { AnilloProgreso } from "@/components/athlete/anillo-progreso";
import { Tooltip1RM } from "@/components/athlete/tooltip-1rm";
import {
  TriangleAlert,
  X,
  Timer,
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
  ArrowUp,
} from "@/components/athlete/icons";
import { isWarmup, isDropset } from "@/lib/serie-tipo";
import { calcularSeriesAproximacion, esEjercicioAislamiento } from "@/lib/aproximacion-pr";
import { formatearCarga, formatearFechaCorta, serieDeReferencia } from "@/lib/historial-ejercicio";
import { motivoSugerencia, partesTitulo } from "@/lib/sugerencia-carga";
import { useAthleteStore } from "@/store/use-athlete-store";
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

/**
 * Etiqueta objetivo de la serie. Las reps numéricas ("8", "6-8") ya se ven en el stepper, así que no se
 * repiten: sólo quedan tiempo ("OBJ. 45 S") y etiquetas especiales ("AL FALLO", "DROP-SET").
 */
export function formatearObjetivoSerie(params: {
  repeticionesObjetivo?: string | null;
  esTiempo: boolean;
  tiempoSegundos: number;
  esUnilateral: boolean;
}): string {
  const texto = (params.repeticionesObjetivo ?? "").trim();
  if (!texto) return "";
  if (params.esTiempo) {
    return `OBJ. ${params.tiempoSegundos} S`;
  }
  const esTiempoEnTexto = /(seg|min|''|"\s*$|\bs\b)/i.test(texto);
  if (/\d/.test(texto) && !esTiempoEnTexto && !/(fallo|drop)/i.test(texto)) return "";
  return `OBJ. ${texto}${params.esUnilateral && !/lado/i.test(texto) ? " POR LADO" : ""}`;
}

function textoRpe(x: number | null): string {
  if (x === null || x === undefined || !Number.isFinite(x)) {
    return "El RPE es el esfuerzo percibido del 1 al 10: 1 es muy suave y 10 es el máximo esfuerzo posible.";
  }
  return `RPE ${fmtAr.format(x)} de 10: ${x >= 9 ? "esfuerzo máximo o casi máximo" : x >= 7 ? "esfuerzo exigente" : x >= 5 ? "esfuerzo moderado" : "esfuerzo suave"}.`;
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
    avisoMolestia,
    ejercicioEstaBloqueado,
    stopTimer,
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
    handleRegistrarParUnilateral,
    handleRegistrarVueltaSuperserie,
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

  const adjuntarVideoASerie = useAthleteStore((s) => s.adjuntarVideoASerie);
  const quitarVideoDeSerie = useAthleteStore((s) => s.quitarVideoDeSerie);
  const reintentarVideoDeSerie = useAthleteStore((s) => s.reintentarVideoDeSerie);

  const [descansoInfo, setDescansoInfo] = React.useState(false);
  const [ssTooltipOpen, setSsTooltipOpen] = React.useState(false);
  const [rpeAyuda, setRpeAyuda] = React.useState(false);
  const [aproxSaltada, setAproxSaltada] = React.useState<Record<string, boolean>>({});
  const [aproxHechasPorEj, setAproxHechasPorEj] = React.useState<Record<string, boolean[]>>({});
  const [barra, setBarra] = React.useState("olimpica");
  const [barraKg, setBarraKg] = React.useState(20);
  const [pesoDraft, setPesoDraft] = React.useState<string | null>(null);
  const [barraDraft, setBarraDraft] = React.useState<string | null>(null);
  const [segundos, setSegundos] = React.useState(0);
  const [uniSplit, setUniSplit] = React.useState(false);
  const [uniIzqKg, setUniIzqKg] = React.useState<number>(0);
  const [uniIzqReps, setUniIzqReps] = React.useState<number>(10);
  const [uniIzqDraft, setUniIzqDraft] = React.useState<string | null>(null);
  const [ssSplitByEx, setSsSplitByEx] = React.useState<Record<string, boolean>>({});
  const [ssIzqByEx, setSsIzqByEx] = React.useState<Record<string, { kg: number; reps: number }>>({});

  React.useEffect(() => {
    setPesoDraft(null);
    setUniIzqDraft(null);
    if (serie) {
      setUniIzqKg(serie.peso_kg);
      setUniIzqReps(serie.reps_hechas);
    }
  }, [currentExercise?.id, serie?.numero_serie]);

  React.useEffect(() => {
    setCierreAbierto(showCelebrationModal);
    return () => setCierreAbierto(false);
  }, [showCelebrationModal, setCierreAbierto]);

  // Wake Lock (CP7): pantalla activa mientras la sesión está abierta, en silencio (sin chip).
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
      } catch {
        // Sin Wake Lock la sesión sigue igual: no se informa al alumno.
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
  const ssGrupo = ej.es_superserie ? ej.grupo_superserie || 1 : null;
  const ssEjercicios =
    ssGrupo !== null
      ? currentSession.ejercicios.filter(
          (x) => x.es_superserie && (x.grupo_superserie || 1) === ssGrupo,
        )
      : [];
  const esCicloSS = ssEjercicios.length >= 2;
  const totalVueltasSS = esCicloSS ? Math.max(...ssEjercicios.map((x) => x.series.length), 0) : 0;
  const vueltasHechasSS = esCicloSS
    ? Math.min(...ssEjercicios.map((x) => x.series.filter((s) => s.completada).length))
    : 0;
  let vueltaActivaSS: number | null = null;
  if (esCicloSS) {
    for (let r = 1; r <= totalVueltasSS; r += 1) {
      const hayPendiente = ssEjercicios.some((x) =>
        x.series.some((s) => s.numero_serie === r && !s.completada),
      );
      if (hayPendiente) {
        vueltaActivaSS = r;
        break;
      }
    }
  }
  const completas = esCicloSS ? vueltaActivaSS === null : ej.series.every((s) => s.completada);
  const hechas = ej.series.filter((s) => s.completada);
  const tieneNotas = Boolean(ej.notas?.trim() || ej.comentario?.trim());
  const siguiente = esCicloSS
    ? currentSession.ejercicios.find(
        (x) =>
          (!x.es_superserie || (x.grupo_superserie || 1) !== ssGrupo) &&
          x.series.some((s) => !s.completada),
      ) ?? null
    : firstIncompleteExercise && firstIncompleteExercise.id !== ej.id
      ? firstIncompleteExercise
      : null;
  const ultima = ultimaVez[ej.ejercicio_id ?? ej.id];
  const refUltima = ultima && serie ? serieDeReferencia(ultima, serie.numero_serie) : null;
  const pesoRef = refUltima?.peso_kg ?? null;
  const abierta = esCicloSS ? vueltaActivaSS !== null && !isAllWorkoutCompleted : Boolean(serie && !completas && !isAllWorkoutCompleted);

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
  const meta = formatearObjetivoSerie({
    repeticionesObjetivo: ej.repeticiones_objetivo,
    esTiempo,
    tiempoSegundos: ej.tiempo_objetivo_segundos ?? tiempoObjetivo,
    esUnilateral: esUni,
  });

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
          {Boolean(ej.url_video?.trim()) && (
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
          {!ejercicioEstaBloqueado && (
            <button
              type="button"
              className="a-tool a-tool-pain"
              aria-label="Tengo una molestia"
              title="Reportar molestia"
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
              <TriangleAlert width={18} height={18} className="a-i" />
            </button>
          )}
        </div>
      </div>

      <div className="a-ex-head" data-testid={`single-exercise-container-${ej.id}`}>
        <div className="a-ex-head-top">
          <div className="a-ex-head-main">
            {!esCicloSS && (
              <span
                className={`a-num${completas ? " a-done" : " a-active"}`}
                aria-label={completas ? "Hecho" : undefined}
              >
                {completas ? <Check width={14} height={14} className="a-i" /> : currentExerciseIndex + 1}
              </span>
            )}
            <div className="a-ex-head-copy">
              <div className="a-xmeta">
                {esCicloSS ? (
                  <>
                    <div className={`a-ss-pill-wrap${ssTooltipOpen ? " a-open" : ""}`}>
                      <button
                        type="button"
                        className="a-ss-pill"
                        aria-expanded={ssTooltipOpen}
                        data-testid="superserie-circuit-banner"
                        onClick={() => setSsTooltipOpen((v) => !v)}
                      >
                        SS
                      </button>
                      <div className="a-ss-popover" role="tooltip">
                        <b>Superserie</b>
                        Hacés estos {ssEjercicios.length} ejercicios seguidos sin pausa y registrás la vuelta completa al iniciar el descanso.
                      </div>
                    </div>
                    <span className="a-eb a-t-label" style={{ margin: 0 }}>
                      {vueltaActivaSS !== null
                        ? `Vuelta ${vueltaActivaSS} de ${totalVueltasSS}`
                        : "Vueltas completas"}
                    </span>
                  </>
                ) : (
                  <span className="a-eb a-t-label" style={{ margin: 0 }}>
                    Ejercicio {currentExerciseIndex + 1} de {currentSession.ejercicios.length}
                  </span>
                )}
                {sessionStartedAt ? (
                  <span className="a-chip a-line a-t-label">
                    <Timer width={12} height={12} className="a-i" /> {mmss(segundos)}
                  </span>
                ) : null}
              </div>
              <h1 className="a-t-h">{esCicloSS ? "Superserie" : ej.nombre}</h1>
            </div>
          </div>
          <AnilloProgreso
            completadas={esCicloSS ? vueltasHechasSS : hechas.length}
            total={esCicloSS ? totalVueltasSS : ej.series.length}
            size={40}
            strokeWidth={3.8}
            ariaLabel={
              esCicloSS
                ? `Superserie ${vueltasHechasSS} de ${totalVueltasSS} vueltas`
                : `${hechas.length} de ${ej.series.length} series`
            }
          />
        </div>
        {!esCicloSS && (
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
        )}
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

      <AvisoMolestia
        aviso={avisoMolestia}
        onTerminarSesion={() => void handleTerminarEntrenamiento()}
        isFinishing={isFinishing}
      />

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
                  registerWarmupSet(ej.id, { peso_kg: a.peso_kg, reps: a.reps });
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

      {abierta && esCicloSS && vueltaActivaSS !== null ? (
        <section
          className="a-setcard a-ss-cycle"
          aria-label={`Vuelta ${vueltaActivaSS} de ${totalVueltasSS}`}
          data-testid={`ss-cycle-card-${ssGrupo}-${vueltaActivaSS}`}
        >
          <div className="a-ss-inline-list">
            {ssEjercicios.map((item) => {
              const itemIdx = currentSession.ejercicios.findIndex((e) => e.id === item.id) + 1;
              const itemSet = item.series.find((s) => s.numero_serie === vueltaActivaSS) ?? item.series[item.series.length - 1];
              const itemDone = item.series.length > 0 && item.series.every((s) => s.completada);
              const itemUni = Boolean(item.es_unilateral);
              const itemSplit = Boolean(ssSplitByEx[item.id]);
              const itemTiempo = item.tipo_medicion === "TIEMPO";
              const itemUltima = ultimaVez[item.ejercicio_id ?? item.id];
              const itemRef = itemUltima && itemSet ? serieDeReferencia(itemUltima, itemSet.numero_serie) : null;
              const izqVals = ssIzqByEx[item.id] ?? {
                kg: itemSet?.peso_kg ?? 0,
                reps: itemSet?.reps_hechas ?? 10,
              };

              const updateIzq = (field: "kg" | "reps", nextVal: number) => {
                setSsIzqByEx((prev) => ({
                  ...prev,
                  [item.id]: {
                    kg: field === "kg" ? Math.max(0, nextVal) : izqVals.kg,
                    reps: field === "reps" ? Math.max(1, nextVal) : izqVals.reps,
                  },
                }));
              };

              return (
                <div key={item.id} className="a-ss-ex-block" data-testid={`ss-cycle-item-${item.id}`}>
                  <div className="a-ss-ex-top">
                    <span
                      className={`a-num${itemDone ? " a-done" : " a-active"}`}
                      aria-label={itemDone ? "Hecho" : undefined}
                    >
                      {itemDone ? <Check width={14} height={14} className="a-i" /> : itemIdx}
                    </span>
                    <div className="a-ss-ex-copy">
                      <b className="a-t-bs">{item.nombre}</b>
                      <small className="a-t-sec a-muted">
                        {item.repeticiones_objetivo}
                        {itemUni ? " por lado" : ""}
                        {itemRef ? ` · Última: ${formatearCarga(itemRef)}` : ""}
                      </small>
                    </div>
                  </div>

                  {itemSet && !itemSet.completada && (
                    <div className="a-ss-ex-ctrl">
                      {itemUni && !itemTiempo && (
                        <div className="a-seg a-seg-compact" role="group" aria-label={`Carga por lado en ${item.nombre}`}>
                          <button
                            type="button"
                            aria-pressed={!itemSplit}
                            data-testid={`ss-uni-same-${item.id}`}
                            onClick={() => setSsSplitByEx((p) => ({ ...p, [item.id]: false }))}
                          >
                            Igual D/I
                          </button>
                          <button
                            type="button"
                            aria-pressed={itemSplit}
                            data-testid={`ss-uni-split-${item.id}`}
                            onClick={() => {
                              setSsIzqByEx((prev) => ({
                                ...prev,
                                [item.id]: prev[item.id] ?? { kg: itemSet.peso_kg, reps: itemSet.reps_hechas },
                              }));
                              setSsSplitByEx((p) => ({ ...p, [item.id]: true }));
                            }}
                          >
                            Separar D/I
                          </button>
                        </div>
                      )}

                      {itemUni && itemSplit && !itemTiempo ? (
                        <div className="a-uni-split">
                          <div className="a-uni-side-card" data-testid={`ss-uni-side-D-${item.id}`}>
                            <span className="a-uni-side-pill">DER</span>
                            <div className="a-uni-grid">
                              <div className="a-mini-step">
                                <button
                                  type="button"
                                  disabled={itemSet.peso_kg <= 0}
                                  aria-label={`Restar ${fmtAr.format(pasoPeso)} kg derecha`}
                                  onClick={() => updateSetField(item.id, itemSet.numero_serie, "peso_kg", Math.max(0, itemSet.peso_kg - pasoPeso))}
                                >
                                  −
                                </button>
                                <span className="a-mini-val">
                                  {fmtAr.format(itemSet.peso_kg)} <small>kg</small>
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Sumar ${fmtAr.format(pasoPeso)} kg derecha`}
                                  onClick={() => updateSetField(item.id, itemSet.numero_serie, "peso_kg", itemSet.peso_kg + pasoPeso)}
                                >
                                  +
                                </button>
                              </div>
                              <div className="a-mini-step">
                                <button
                                  type="button"
                                  disabled={itemSet.reps_hechas <= 1}
                                  aria-label="Restar 1 rep derecha"
                                  onClick={() => updateSetField(item.id, itemSet.numero_serie, "reps_hechas", Math.max(1, itemSet.reps_hechas - 1))}
                                >
                                  −
                                </button>
                                <span className="a-mini-val">
                                  {itemSet.reps_hechas} <small>reps</small>
                                </span>
                                <button
                                  type="button"
                                  aria-label="Sumar 1 rep derecha"
                                  onClick={() => updateSetField(item.id, itemSet.numero_serie, "reps_hechas", itemSet.reps_hechas + 1)}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="a-uni-side-card" data-testid={`ss-uni-side-I-${item.id}`}>
                            <span className="a-uni-side-pill a-alt">IZQ</span>
                            <div className="a-uni-grid">
                              <div className="a-mini-step">
                                <button
                                  type="button"
                                  disabled={izqVals.kg <= 0}
                                  aria-label={`Restar ${fmtAr.format(pasoPeso)} kg izquierda`}
                                  onClick={() => updateIzq("kg", izqVals.kg - pasoPeso)}
                                >
                                  −
                                </button>
                                <span className="a-mini-val">
                                  {fmtAr.format(izqVals.kg)} <small>kg</small>
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Sumar ${fmtAr.format(pasoPeso)} kg izquierda`}
                                  onClick={() => updateIzq("kg", izqVals.kg + pasoPeso)}
                                >
                                  +
                                </button>
                              </div>
                              <div className="a-mini-step">
                                <button
                                  type="button"
                                  disabled={izqVals.reps <= 1}
                                  aria-label="Restar 1 rep izquierda"
                                  onClick={() => updateIzq("reps", izqVals.reps - 1)}
                                >
                                  −
                                </button>
                                <span className="a-mini-val">
                                  {izqVals.reps} <small>reps</small>
                                </span>
                                <button
                                  type="button"
                                  aria-label="Sumar 1 rep izquierda"
                                  onClick={() => updateIzq("reps", izqVals.reps + 1)}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="a-uni-grid">
                          {!itemTiempo && (
                            <div className="a-mini-step">
                              <button
                                type="button"
                                disabled={itemSet.peso_kg <= 0}
                                aria-label={`Restar ${fmtAr.format(pasoPeso)} kg en ${item.nombre}`}
                                onClick={() => updateSetField(item.id, itemSet.numero_serie, "peso_kg", Math.max(0, itemSet.peso_kg - pasoPeso))}
                              >
                                −
                              </button>
                              <span className="a-mini-val">
                                {fmtAr.format(itemSet.peso_kg)} <small>kg</small>
                              </span>
                              <button
                                type="button"
                                aria-label={`Sumar ${fmtAr.format(pasoPeso)} kg en ${item.nombre}`}
                                onClick={() => updateSetField(item.id, itemSet.numero_serie, "peso_kg", itemSet.peso_kg + pasoPeso)}
                              >
                                +
                              </button>
                            </div>
                          )}
                          <div className="a-mini-step">
                            <button
                              type="button"
                              disabled={itemSet.reps_hechas <= 1}
                              aria-label={itemTiempo ? "Restar 5 segundos" : `Restar 1 rep en ${item.nombre}`}
                              onClick={() =>
                                updateSetField(
                                  item.id,
                                  itemSet.numero_serie,
                                  "reps_hechas",
                                  Math.max(1, itemSet.reps_hechas - (itemTiempo ? 5 : 1)),
                                )
                              }
                            >
                              −
                            </button>
                            <span className="a-mini-val">
                              {itemSet.reps_hechas} <small>{itemTiempo ? "s" : "reps"}</small>
                            </span>
                            <button
                              type="button"
                              aria-label={itemTiempo ? "Sumar 5 segundos" : `Sumar 1 rep en ${item.nombre}`}
                              onClick={() =>
                                updateSetField(
                                  item.id,
                                  itemSet.numero_serie,
                                  "reps_hechas",
                                  itemSet.reps_hechas + (itemTiempo ? 5 : 1),
                                )
                              }
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="a-btn a-gym a-pill"
            disabled={ejercicioEstaBloqueado}
            data-testid="registrar-serie-btn"
            onClick={() => {
              const entradas: Record<
                string,
                { pesoKg: number; reps: number; parUni?: { D: { kg: number; reps: number }; I: { kg: number; reps: number } } }
              > = {};
              for (const item of ssEjercicios) {
                const st = item.series.find((s) => s.numero_serie === vueltaActivaSS);
                if (!st || st.completada) continue;
                const itemUni = Boolean(item.es_unilateral);
                const itemSplit = Boolean(ssSplitByEx[item.id]);
                const izq = ssIzqByEx[item.id] ?? { kg: st.peso_kg, reps: st.reps_hechas };
                if (itemUni) {
                  const par = itemSplit
                    ? { D: { kg: st.peso_kg, reps: st.reps_hechas }, I: izq }
                    : { D: { kg: st.peso_kg, reps: st.reps_hechas }, I: { kg: st.peso_kg, reps: st.reps_hechas } };
                  entradas[item.id] = {
                    pesoKg: Math.max(par.D.kg, par.I.kg),
                    reps: par.D.reps,
                    parUni: par,
                  };
                } else {
                  entradas[item.id] = { pesoKg: st.peso_kg, reps: st.reps_hechas };
                }
              }
              handleRegistrarVueltaSuperserie(ssEjercicios, vueltaActivaSS, entradas);
            }}
          >
            <Check width={18} height={18} className="a-i" />{" "}
            {`Registrar vuelta ${vueltaActivaSS} · ${ej.descanso_segundos} s`}
          </button>
        </section>
      ) : abierta && serie ? (
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
                  disabled={ejercicioEstaBloqueado}
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
                <div className="a-seg a-seg-compact" role="group" aria-label="Cargas por lado" data-testid="unilateral-indicator">
                  <button
                    type="button"
                    aria-pressed={!uniSplit}
                    data-testid="uni-mode-same"
                    onClick={() => setUniSplit(false)}
                  >
                    Igual D/I
                  </button>
                  <button
                    type="button"
                    aria-pressed={uniSplit}
                    data-testid="uni-mode-split"
                    onClick={() => {
                      setUniIzqKg(serie.peso_kg);
                      setUniIzqReps(serie.reps_hechas);
                      setUniSplit(true);
                    }}
                  >
                    Separar D/I
                  </button>
                </div>
              )}

              {esUni && uniSplit ? (
                <div className="a-uni-split">
                  <div className="a-uni-side-card" data-testid="uni-side-D">
                    <span className="a-uni-side-pill">DER</span>
                    <div className="a-uni-grid">
                      <div className="a-mini-step">
                        <button
                          type="button"
                          disabled={serie.peso_kg <= 0}
                          onClick={() => {
                            setPesoDraft(null);
                            handleAdjustPeso(-pasoPeso);
                          }}
                          aria-label={`Restar ${fmtAr.format(pasoPeso)} kg derecha`}
                          data-testid="peso-decrement-btn"
                        >
                          −
                        </button>
                        <input
                          id={`peso-${ej.id}-${serie.numero_serie}`}
                          className="a-mini-input"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label="Peso derecha en kilogramos"
                          value={pesoDraft ?? fmtAr.format(serie.peso_kg)}
                          onFocus={() => setPesoDraft(fmtAr.format(serie.peso_kg))}
                          onChange={(e) => {
                            setPesoDraft(e.target.value);
                            handleDirectUpdatePeso(parsearPesoDecimal(e.target.value));
                          }}
                          onBlur={() => setPesoDraft(null)}
                        />
                        <span className="a-mini-unit">kg</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPesoDraft(null);
                            handleAdjustPeso(pasoPeso);
                          }}
                          aria-label={`Sumar ${fmtAr.format(pasoPeso)} kg derecha`}
                          data-testid="peso-increment-btn"
                        >
                          +
                        </button>
                      </div>
                      <div className="a-mini-step">
                        <button
                          type="button"
                          disabled={serie.reps_hechas <= 1}
                          onClick={() => handleAdjustReps(-1)}
                          aria-label="Restar una repetición derecha"
                          data-testid="reps-decrement-btn"
                        >
                          −
                        </button>
                        <span className="a-mini-val">
                          {serie.reps_hechas} <small>reps</small>
                        </span>
                        <button
                          type="button"
                          disabled={repRange?.isRange ? serie.reps_hechas >= repRange.max : false}
                          onClick={() => handleAdjustReps(1)}
                          aria-label="Sumar una repetición derecha"
                          data-testid="reps-increment-btn"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="a-uni-side-card" data-testid="uni-side-I">
                    <span className="a-uni-side-pill a-alt">IZQ</span>
                    <div className="a-uni-grid">
                      <div className="a-mini-step">
                        <button
                          type="button"
                          disabled={uniIzqKg <= 0}
                          onClick={() => {
                            setUniIzqDraft(null);
                            setUniIzqKg((v) => Math.max(0, v - pasoPeso));
                          }}
                          aria-label={`Restar ${fmtAr.format(pasoPeso)} kg izquierda`}
                        >
                          −
                        </button>
                        <input
                          className="a-mini-input"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label="Peso izquierda en kilogramos"
                          value={uniIzqDraft ?? fmtAr.format(uniIzqKg)}
                          onFocus={() => setUniIzqDraft(fmtAr.format(uniIzqKg))}
                          onChange={(e) => {
                            setUniIzqDraft(e.target.value);
                            setUniIzqKg(parsearPesoDecimal(e.target.value));
                          }}
                          onBlur={() => setUniIzqDraft(null)}
                        />
                        <span className="a-mini-unit">kg</span>
                        <button
                          type="button"
                          onClick={() => {
                            setUniIzqDraft(null);
                            setUniIzqKg((v) => v + pasoPeso);
                          }}
                          aria-label={`Sumar ${fmtAr.format(pasoPeso)} kg izquierda`}
                        >
                          +
                        </button>
                      </div>
                      <div className="a-mini-step">
                        <button
                          type="button"
                          disabled={uniIzqReps <= 1}
                          onClick={() => setUniIzqReps((v) => Math.max(1, v - 1))}
                          aria-label="Restar una repetición izquierda"
                        >
                          −
                        </button>
                        <span className="a-mini-val">
                          {uniIzqReps} <small>reps</small>
                        </span>
                        <button
                          type="button"
                          disabled={repRange?.isRange ? uniIzqReps >= repRange.max : false}
                          onClick={() => setUniIzqReps((v) => v + 1)}
                          aria-label="Sumar una repetición izquierda"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
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
                        className={`a-t-mi${(pesoDraft ?? fmtAr.format(serie.peso_kg)).length >= 5 ? " a-long" : ""}`}
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
                </>
              )}

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
                        else if (esUni) {
                          const par = uniSplit
                            ? { D: { kg: serie.peso_kg, reps: serie.reps_hechas }, I: { kg: uniIzqKg, reps: uniIzqReps } }
                            : { D: { kg: serie.peso_kg, reps: serie.reps_hechas }, I: { kg: serie.peso_kg, reps: serie.reps_hechas } };
                          handleRegistrarParUnilateral(par, true);
                        } else handleRegistrarSerie(true);
                      }}
                    >
                      Sí, es correcto
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {(!esUni || !uniSplit || esTiempo) && (
            <>
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
            </>
          )}

          {!esTiempo && repRange?.isRange && (
            <small className="a-t-sec a-muted" data-testid="rep-range-badge">
              Rango: {repRange.min} a {repRange.max} reps (máx. {repRange.max})
            </small>
          )}

          {!isSimpleView && !esTiempo && (
            <details className="a-tec a-fold" data-testid="vista-tecnica">
              <summary className="a-fold-sum a-t-label" data-testid="vista-tecnica-resumen">
                Vista técnica
              </summary>
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
              <details className="a-fold a-fold-sub" data-testid="calculadora-barra">
              <summary className="a-fold-sum a-t-label">Calculadora de barra y discos</summary>
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
              </details>
            </details>
          )}

          <button
            type="button"
            className="a-btn a-gym a-pill"
            disabled={ejercicioEstaBloqueado}
            onClick={() => {
              if (esUni) {
                const par = uniSplit
                  ? { D: { kg: serie.peso_kg, reps: serie.reps_hechas }, I: { kg: uniIzqKg, reps: uniIzqReps } }
                  : { D: { kg: serie.peso_kg, reps: serie.reps_hechas }, I: { kg: serie.peso_kg, reps: serie.reps_hechas } };
                handleRegistrarParUnilateral(par, false);
              } else {
                handleRegistrarSerie(false);
              }
            }}
            data-testid="registrar-serie-btn"
          >
            <Check width={18} height={18} className="a-i" />{" "}
            {esTiempo
              ? `Registrar ${serie.reps_hechas} s`
              : esDrop
                ? `Registrar drop ${serie.numero_serie}`
                : `Registrar serie ${serie.numero_serie}`}
          </button>
        </section>
      ) : (
        <section className="a-card a-donecard">
          <b className="a-t-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Check width={20} height={20} className="a-i" /> {esCicloSS ? "Superserie completa" : "Ejercicio completo"}
          </b>
          <span className="a-t-sec a-muted">
            {esCicloSS
              ? `${totalVueltasSS} ${totalVueltasSS === 1 ? "vuelta registrada" : "vueltas registradas"}.`
              : `${ej.series.length} ${ej.series.length === 1 ? "serie registrada" : "series registradas"}.`}
          </span>
          {siguiente ? (
            <button
              type="button"
              className="a-btn a-gym a-pill"
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
              className="a-btn a-gym a-pill"
              disabled={isFinishing}
              onClick={isAllWorkoutCompleted ? () => setShowCelebrationModal(true) : handleTerminarEntrenamiento}
              data-testid="terminar-entrenamiento-btn-entrenar"
            >
              {isFinishing ? "Guardando…" : "Terminar sesión"}
            </button>
          )}
        </section>
      )}

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
                  {(() => {
                    const videoEstado = s.videoEstado ?? (s.video_url ? "listo" : "ninguno");
                    if (videoEstado === "subiendo") {
                      return (
                        <span
                          className="a-chip a-line a-t-label"
                          role="status"
                          data-testid={`serie-video-subiendo-${s.numero_serie}`}
                        >
                          <ArrowUp width={11} height={11} className="a-i" /> Subiendo…
                        </span>
                      );
                    }
                    if (videoEstado === "telefono") {
                      return (
                        <span
                          className="a-chip a-ap a-t-label"
                          data-testid={`serie-video-telefono-${s.numero_serie}`}
                        >
                          <Smartphone width={11} height={11} className="a-i" /> Video en el teléfono
                        </span>
                      );
                    }
                    if (videoEstado === "error") {
                      return (
                        <button
                          type="button"
                          className="a-vbtn"
                          onClick={() => void reintentarVideoDeSerie(ej.id, s.numero_serie)}
                          aria-label={`Reintentar el video de la serie ${s.numero_serie}`}
                          data-testid={`serie-video-reintentar-${s.numero_serie}`}
                        >
                          <TriangleAlert width={14} height={14} className="a-i" /> Reintentar video
                        </button>
                      );
                    }
                    if (videoEstado === "listo") {
                      return (
                        <button
                          type="button"
                          className="a-chip a-line a-t-label"
                          onClick={() =>
                            setVideoUploadModalData({
                              exerciseId: ej.id,
                              exerciseName: ej.nombre,
                              setNumber: s.numero_serie,
                            })
                          }
                          aria-label={`Video adjunto en la serie ${s.numero_serie}`}
                          data-testid={`serie-video-listo-${s.numero_serie}`}
                        >
                          <Video width={11} height={11} className="a-i" /> Video
                        </button>
                      );
                    }
                    return (
                      <button
                        type="button"
                        className="a-vbtn"
                        onClick={() =>
                          setVideoUploadModalData({
                            exerciseId: ej.id,
                            exerciseName: ej.nombre,
                            setNumber: s.numero_serie,
                          })
                        }
                        aria-label={`Agregar video a la serie ${s.numero_serie}`}
                        data-testid={`serie-video-btn-${s.numero_serie}`}
                      >
                        <Video width={14} height={14} className="a-i" /> Video
                      </button>
                    );
                  })()}
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
              }).then((mol) => {
                if (mol.nivel === "alta" || mol.nivel === "alarma") stopTimer();
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
          currentVideoUrl={
            currentSession.ejercicios
              .find((e) => e.id === videoUploadModalData.exerciseId)
              ?.series.find((s) => s.numero_serie === videoUploadModalData.setNumber)?.video_url ??
            null
          }
          onAttachVideo={async (origen) => {
            if (origen.tipo === "archivo") {
              const offlineAhora = typeof navigator !== "undefined" && navigator.onLine === false;
              const setNum = videoUploadModalData.setNumber;
              void adjuntarVideoASerie(videoUploadModalData.exerciseId, setNum, origen);
              setToastSesion({
                mensaje: offlineAhora
                  ? "Sin señal: el video se envía cuando vuelva la conexión."
                  : `Video adjunto a la serie ${setNum}`,
                tipo: "ok",
              });
              return "ok";
            }
            const res = await adjuntarVideoASerie(
              videoUploadModalData.exerciseId,
              videoUploadModalData.setNumber,
              origen,
            );
            if (res === "ok") {
              setToastSesion({
                mensaje: `Video adjunto a la serie ${videoUploadModalData.setNumber}`,
                tipo: "ok",
              });
            }
            return res;
          }}
          onRemoveVideo={() => {
            quitarVideoDeSerie(videoUploadModalData.exerciseId, videoUploadModalData.setNumber);
          }}
          onSaveVideoUrl={(url) =>
            attachVideoForSet(videoUploadModalData.exerciseId, videoUploadModalData.setNumber, url)
          }
        />
      )}
      {isFinishing && (
        <div
          className="a-sheet-wrap"
          style={{ alignItems: "center", justifyContent: "center", padding: 20 }}
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-testid="guardando-sesion-overlay"
        >
          <div className="a-card a-state" style={{ width: "min(92vw, 22rem)" }}>
            <div className="a-loading" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <b className="a-t-bs">Guardando tu sesión…</b>
            <p className="a-t-sec">Esperá un momento, no cierres la app.</p>
          </div>
        </div>
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
        duracionMinutos={Math.max(
          1,
          Math.round((Date.now() - (sessionStartedAt ?? sessionStartTimeRef.current)) / 60000),
        )}
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
