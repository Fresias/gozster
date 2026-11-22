"use client";

import * as React from "react";
import { type LiveWorkoutExercise, type LiveWorkoutSet } from "@/store/use-athlete-store";
import { ejercicioBloqueado } from "@/lib/athlete/molestias";
import {
  NOMBRE_PREFERIDO_MAX_LEN,
  nombreParaSaludo,
  normalizarNombrePreferido,
} from "@/lib/athlete/nombre";
import { isWarmup } from "@/lib/serie-tipo";
import { PainReportModal } from "@/components/athlete/pain-report-modal";
import { useAtraparFocoEnHoja } from "@/components/athlete/athlete-sheet";
import { CierreDiaModal } from "@/components/athlete/cierre-dia-modal";
import { CuestionarioInicial } from "@/components/athlete/cuestionario-inicial";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MessageSquare,
  Settings,
  Smartphone,
  Timer,
  TriangleAlert,
  Trophy,
  X,
} from "@/components/athlete/icons";
import {
  useLiveWorkout,
  etiquetaGrupoSuperserie,
} from "@/components/athlete/use-live-workout";

const formatAr = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatEjercicioMeta(ej: LiveWorkoutExercise): string {
  const totalSeries = ej.series.length;
  const labelSeries = totalSeries === 1 ? "serie" : "series";
  if (ej.tipo_medicion === "TIEMPO") {
    const t =
      ej.tiempo_objetivo_segundos ??
      (parseInt(ej.repeticiones_objetivo.replace(/\D/g, ""), 10) || 30);
    return `${t} s · ${totalSeries} ${labelSeries}`;
  }
  if (ej.es_unilateral) {
    return `${ej.repeticiones_objetivo} reps por lado · ${totalSeries} ${labelSeries}`;
  }
  return `${ej.repeticiones_objetivo} reps · ${totalSeries} ${labelSeries}`;
}

function formatSetLogText(ej: LiveWorkoutExercise, s: LiveWorkoutSet): string {
  if (ej.tipo_medicion === "TIEMPO") {
    return `${s.reps_hechas} s`;
  }
  return `${formatAr.format(s.peso_kg)} kg × ${s.reps_hechas}`;
}

export function RutinaDelDia() {
  const {
    currentSession,
    reportPainForSet,
    reportarMolestia,
    volverAlInicio,
    setEjercicioAbiertoId,
    setSelectedExerciseId,
    setCierreAbierto,
    setToastSesion,
    setCuestionarioAbierto,
    setNivelVistaAlumno,
    usarVistaRecomendada,
    setPasoIncrementoPeso,
    mostrarTimerDescanso,
    setMostrarTimerDescanso,
    cuestionarioInicial,
    nombrePreferido,
    guardarNombrePreferido,
    sesionesCompletadas,
    planAlumno,
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
    seriesRecord,
    isFinishing,
    workoutFinished,
    showCelebrationModal,
    setShowCelebrationModal,
    sessionPRs,
    sessionStartTimeRef,
    sessionStartedAt,
    painModalData,
    setPainModalData,
    syncError,
    clearSyncError,
    pendingEvents,
    totalSets,
    completedSetsCount,
    completedExercisesCount,
    totalExercises,
    totalVolumeKg,
    effectiveVolumeKg,
    latestUnreadStaffMessage,
    setAthleteChatOpen,
    handleTerminarEntrenamiento,
    stopTimer,
    cleanDiaTitle,
    isAllWorkoutCompleted,
  } = useLiveWorkout();

  const [confirmingFinish, setConfirmingFinish] = React.useState(false);
  const settingsBtnRef = React.useRef<HTMLButtonElement>(null);
  const settingsTitleRef = React.useRef<HTMLHeadingElement>(null);
  const settingsSheetRef = React.useRef<HTMLDivElement>(null);
  const fullNameForGreeting =
    currentSession.studentName || planAlumno?.alumnos[0]?.nombre_completo || "";
  const [draftName, setDraftName] = React.useState<string>("");
  const initialDraftNameRef = React.useRef<string>("");
  const [nameToast, setNameToast] = React.useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeSettings = React.useCallback(() => {
    setIsSettingsOpen(false);
    settingsBtnRef.current?.focus();
  }, [setIsSettingsOpen]);

  React.useEffect(() => {
    if (!isSettingsOpen) return;
    const greeting = nombreParaSaludo({
      nombre_preferido: nombrePreferido,
      nombre_completo: fullNameForGreeting,
    });
    setDraftName(greeting);
    initialDraftNameRef.current = greeting;
    settingsTitleRef.current?.focus();
  }, [isSettingsOpen, nombrePreferido, fullNameForGreeting]);

  useAtraparFocoEnHoja(isSettingsOpen, settingsSheetRef, settingsTitleRef, closeSettings);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleSaveNameOnBlur = async () => {
    const trimmed = draftName.trim();
    if (trimmed === initialDraftNameRef.current.trim()) return;
    const normalized = normalizarNombrePreferido(trimmed);
    initialDraftNameRef.current =
      normalized ??
      nombreParaSaludo({
        nombre_preferido: null,
        nombre_completo: fullNameForGreeting,
      });
    await guardarNombrePreferido(normalized);
    const msg = normalized
      ? `Listo, te llamamos ${normalized}`
      : "Listo, usamos tu nombre completo";
    setNameToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setNameToast(null), 3200);
  };

  const [elapsedSec, setElapsedSec] = React.useState<number>(() =>
    sessionStartedAt ? Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)) : 0,
  );

  React.useEffect(() => {
    if (!sessionStartedAt) {
      setElapsedSec(0);
      return;
    }
    const update = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  React.useEffect(() => {
    setCierreAbierto(showCelebrationModal);
    return () => setCierreAbierto(false);
  }, [showCelebrationModal, setCierreAbierto]);

  const molestias = currentSession.molestias ?? [];

  const nextExercise = React.useMemo(
    () =>
      currentSession.ejercicios.find(
        (ej) =>
          ej.series.some((s) => !s.completada) &&
          !ejercicioBloqueado(ej.id, molestias),
      ) ?? null,
    [currentSession.ejercicios, molestias],
  );

  const setsProgressPercent =
    totalSets > 0 ? Math.round((completedSetsCount / totalSets) * 100) : 0;

  const remainingSets = Math.max(0, totalSets - completedSetsCount);

  const isSetPendingOffline = React.useCallback(
    (exerciseId: string, setNumber: number) =>
      pendingEvents.some((ev) => {
        if (ev.action !== "WORKOUT_SET_COMPLETED" && ev.action !== "WORKOUT_SET_UPDATED") {
          return false;
        }
        const payload = ev.payload as
          | { exerciseId?: string; setNumber?: number; sessionId?: string }
          | undefined;
        if (!payload) return false;
        if (payload.exerciseId !== exerciseId || payload.setNumber !== setNumber) return false;
        return !payload.sessionId || payload.sessionId === currentSession.id;
      }),
    [pendingEvents, currentSession.id],
  );

  const openExercise = (exerciseId: string) => {
    setConfirmingFinish(false);
    setSelectedExerciseId(exerciseId);
    setEjercicioAbiertoId(exerciseId);
  };

  if (activeTab === "cuestionario") {
    return (
      <div className="a-view a-anim" data-testid="live-workout-container">
        <div className="a-wk-head">
          <button
            type="button"
            className="a-back"
            onClick={() => {
              setCuestionarioAbierto(false);
              setActiveTab("workout");
            }}
            data-testid="tab-workout"
          >
            <ChevronLeft width={18} height={18} className="a-i" />
            Volver a la rutina
          </button>
        </div>
        <CuestionarioInicial
          athleteId={currentSession.studentId}
          athleteName={currentSession.studentName}
        />
      </div>
    );
  }

  const renderExerciseRow = (ej: LiveWorkoutExercise, inSuperset: boolean) => {
    const idx = currentSession.ejercicios.findIndex((e) => e.id === ej.id) + 1;
    const isNext = nextExercise?.id === ej.id;
    const isDone = ej.series.length > 0 && ej.series.every((s) => s.completada);
    const completedCount = ej.series.filter((s) => s.completada).length;
    const hasMolestia = molestias.some((m) => m.ejercicioEnRutinaId === ej.id);
    const isDropSet = ej.tipo_serie === "DROPSET";
    const hasWarmup =
      ej.tipo_serie === "WARMUP" ||
      ej.series.some((s) => isWarmup(s.set_type)) ||
      ej.nombre.toLowerCase().includes("warm up") ||
      ej.nombre.toLowerCase().includes("calentamiento");
    const showWarmupChip = hasWarmup && completedCount === 0;
    const showAnyChip =
      isDropSet || Boolean(ej.es_unilateral) || ej.tipo_medicion === "TIEMPO" || showWarmupChip;

    const rowClass = [
      inSuperset ? "" : "a-card",
      "a-row",
      isNext ? "a-next" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        key={ej.id}
        type="button"
        onClick={() => openExercise(ej.id)}
        data-testid={`exercise-select-btn-${ej.id}`}
        className={rowClass}
      >
        <span className="a-num">{idx}</span>
        <span className="a-rt">
          <b className="a-t-bs">{ej.nombre}</b>
          <small className="a-t-sec">{formatEjercicioMeta(ej)}</small>
          {showAnyChip && (
            <span className="a-tags mt-1">
              {isDropSet && (
                <span className="a-chip a-ss a-t-label" data-testid={`dropset-tag-${ej.id}`}>
                  Drop set
                </span>
              )}
              {ej.es_unilateral && (
                <span className="a-chip a-line a-t-label" data-testid={`badge-unilateral-${ej.id}`}>
                  Por lado
                </span>
              )}
              {ej.tipo_medicion === "TIEMPO" && (
                <span className="a-chip a-line a-t-label" data-testid={`badge-tiempo-${ej.id}`}>
                  <Timer width={12} height={12} className="a-i" /> Tiempo
                </span>
              )}
              {showWarmupChip && (
                <span className="a-chip a-ap a-t-label" data-testid={`warmup-tag-${ej.id}`}>
                  Aproximación
                </span>
              )}
            </span>
          )}
        </span>
        {isDone ? (
          <span className="a-chip a-ok a-t-label">
            <Check width={12} height={12} className="a-i" /> Hecho
          </span>
        ) : hasMolestia ? (
          <span className="a-chip a-bad a-t-label" data-testid={`molestia-chip-${ej.id}`}>
            <TriangleAlert width={12} height={12} className="a-i" /> Molestia
          </span>
        ) : (
          <span
            className="a-dots"
            aria-label={`${completedCount} de ${ej.series.length} series`}
          >
            {ej.series.map((s, sIdx) => (
              <i
                key={s.numero_serie ?? sIdx}
                className={s.completada ? "a-on" : undefined}
              />
            ))}
          </span>
        )}
      </button>
    );
  };

  const renderExerciseList = () => {
    const seenGroups = new Set<number>();
    return currentSession.ejercicios.map((ej) => {
      if (ej.es_superserie) {
        const grupo = ej.grupo_superserie || 1;
        if (seenGroups.has(grupo)) return null;
        seenGroups.add(grupo);
        const groupExercises = currentSession.ejercicios.filter(
          (x) => x.es_superserie && (x.grupo_superserie || 1) === grupo,
        );
        const roundsDone = Math.min(
          ...groupExercises.map((x) => x.series.filter((s) => s.completada).length),
        );
        const totalRounds = groupExercises[0]?.series.length ?? 0;
        const label = etiquetaGrupoSuperserie(currentSession.ejercicios, ej);

        return (
          <section
            key={`ss-${grupo}`}
            className="a-ss"
            aria-label={label}
            data-testid={`superserie-grupo-${grupo}`}
          >
            <div className="a-ss-h">
              <span className="a-t-label">{label} · sin descanso entre ejercicios</span>
              <span className="a-t-label">
                {roundsDone}/{totalRounds}
              </span>
            </div>
            {groupExercises.map((x) => renderExerciseRow(x, true))}
          </section>
        );
      }
      return renderExerciseRow(ej, false);
    });
  };

  const modalDefaultExercise = nextExercise ?? currentSession.ejercicios[0];

  return (
    <div className="a-view a-anim" data-testid="live-workout-container">
      {/* Cabecera: volver + configuración */}
      <div className="a-wk-head">
        <button
          type="button"
          className="a-back"
          onClick={volverAlInicio}
          aria-label="Volver a Mis días"
          data-testid="volver-a-mis-dias-btn"
        >
          <ChevronLeft width={18} height={18} className="a-i" />
          Mis días
        </button>
        <div className="a-tools">
          <button
            ref={settingsBtnRef}
            type="button"
            className="a-tool"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Configuración"
            data-testid="athlete-settings-btn"
          >
            <Settings width={20} height={20} className="a-i" />
          </button>
        </div>
      </div>

      {/* Título del día + timer de sesión si empezó */}
      <div className="a-wk-title">
        <div>
          <h1 className="a-t-d">{cleanDiaTitle || "DÍA 1"}</h1>
          <span className="a-t-sec a-muted">
            {currentSession.studentName
              ? `${currentSession.studentName} · ${totalExercises} ejercicios`
              : `${totalExercises} ejercicios`}
          </span>
        </div>
        {(sessionStartedAt !== null || completedSetsCount > 0) && (
          <span className="a-chip a-line a-t-label" data-testid="session-elapsed-chip">
            <Timer width={12} height={12} className="a-i" />
            <span>{formatMmSs(elapsedSec)}</span>
          </span>
        )}
      </div>

      {/* Barra de error de guardado */}
      {syncError && (
        <div className="a-errbar" role="alert" data-testid="sync-error-notice">
          <TriangleAlert width={20} height={20} className="a-i" />
          <span className="a-rt">
            <b className="a-t-bs">No pudimos guardar en el servidor</b>
            <small className="a-t-sec">Tus datos siguen en el teléfono.</small>
          </span>
          <button type="button" onClick={clearSyncError} aria-label="Cerrar aviso de error">
            Cerrar
          </button>
        </div>
      )}

      {/* Tarjeta de mensaje no leído del coach */}
      {latestUnreadStaffMessage && (
        <button
          type="button"
          onClick={() => setAthleteChatOpen(true)}
          className="a-card a-coachmsg text-left w-full"
          data-testid="unread-coach-message-banner"
        >
          <span className="a-av">
            <MessageSquare width={18} height={18} className="a-i" />
          </span>
          <span className="a-rt">
            <b className="a-t-bs">
              Mensaje del coach <span className="a-chip a-ink a-t-label">Nuevo</span>
            </b>
            <small className="a-t-sec">{latestUnreadStaffMessage.contenido}</small>
          </span>
          <ChevronRight width={18} height={18} className="a-i" />
        </button>
      )}

      {/* Tarjeta de avance segmentada */}
      <div className="a-card a-pcard" data-testid="rutina-progress-card">
        <div className="a-t">
          <span className="a-t-bs">
            {completedExercisesCount} de {totalExercises} ejercicios
          </span>
          <span className="a-t-label a-muted">
            {completedSetsCount}/{totalSets} series
          </span>
        </div>
        <div
          className="a-segbar"
          role="progressbar"
          aria-valuenow={setsProgressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance de la sesión"
        >
          {currentSession.ejercicios.map((ej) => (
            <span
              key={ej.id}
              style={{ "--n": Math.max(1, ej.series.length) } as React.CSSProperties}
            >
              {ej.series.map((s, sIdx) => (
                <i
                  key={s.numero_serie ?? sIdx}
                  className={s.completada ? "a-on" : undefined}
                />
              ))}
            </span>
          ))}
        </div>
        {!isSimpleView && (
          <div className="a-vols a-t-sec">
            <span>
              Volumen efectivo: <b>{formatAr.format(effectiveVolumeKg)} kg</b>
            </span>
            <span>
              Bruto: <b>{formatAr.format(totalVolumeKg)} kg</b>
            </span>
          </div>
        )}
      </div>

      {/* Segmentado: Entrenar | Registro de la sesión */}
      <div className="a-seg" role="group" aria-label="Vista de la sesión">
        <button
          type="button"
          aria-pressed={workoutTab === "entrenar"}
          onClick={() => setWorkoutTab("entrenar")}
          data-testid="tab-entrenar"
        >
          Entrenar
        </button>
        <button
          type="button"
          aria-pressed={workoutTab === "registro"}
          onClick={() => setWorkoutTab("registro")}
          data-testid="tab-registro-dia"
        >
          Registro de la sesión
        </button>
      </div>

      {workoutTab === "entrenar" ? (
        <>
          <p className="a-eb a-t-label">Rutina</p>
          <div className="flex flex-col gap-3" data-testid="exercise-selector-column">
            {renderExerciseList()}
          </div>

          {nextExercise && (
            <button
              type="button"
              className="a-btn a-gym"
              onClick={() => openExercise(nextExercise.id)}
              data-testid="empezar-rutina-btn"
            >
              {completedSetsCount > 0 ? `Seguir: ${nextExercise.nombre}` : "Empezar"}
              <ArrowRight width={18} height={18} className="a-i" />
            </button>
          )}

          <button
            type="button"
            className="a-molbtn"
            onClick={() =>
              setPainModalData({
                exerciseId: modalDefaultExercise?.id || "",
                ejercicioId: modalDefaultExercise?.ejercicio_id || "",
                exerciseName: currentSession.nombre_rutina,
                setNumber: 1,
              })
            }
            data-testid="header-pain-report-btn"
          >
            <TriangleAlert width={18} height={18} className="a-i" />
            Tengo una molestia
          </button>

          {confirmingFinish ? (
            <div
              className="a-card a-confirm p-3.5 grid gap-2.5"
              role="alert"
              data-testid="confirmar-terminar-card"
            >
              <b className="a-t-bs">
                Te {remainingSets === 1 ? "falta 1 serie" : `faltan ${remainingSets} series`}.
              </b>
              <span className="a-t-sec a-muted">Lo que registraste se guarda igual.</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="a-btn a-ghost"
                  onClick={() => setConfirmingFinish(false)}
                  data-testid="terminar-seguir-btn"
                >
                  Seguir
                </button>
                <button
                  type="button"
                  className="a-btn"
                  disabled={isFinishing}
                  onClick={() => {
                    setConfirmingFinish(false);
                    void handleTerminarEntrenamiento();
                  }}
                  data-testid="terminar-confirmar-btn"
                >
                  {isFinishing ? "Guardando…" : "Terminar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`a-btn${nextExercise ? " a-ghost" : ""}`}
              disabled={isFinishing}
              onClick={() => {
                if (workoutFinished || isAllWorkoutCompleted) {
                  setShowCelebrationModal(true);
                } else if (remainingSets > 0) {
                  setConfirmingFinish(true);
                } else {
                  void handleTerminarEntrenamiento();
                }
              }}
              data-testid="terminar-entrenamiento-btn-entrenar"
            >
              {isFinishing ? "Guardando sesión…" : "Terminar sesión"}
            </button>
          )}
        </>
      ) : completedSetsCount === 0 ? (
        <section className="a-card a-state" data-testid="registro-dia-container">
          <span className="a-ic">
            <ClipboardList width={22} height={22} className="a-i" />
          </span>
          <b className="a-t-bs">Todavía no guardaste ninguna serie hoy</b>
          <button
            type="button"
            className="a-btn a-soft"
            onClick={() => setWorkoutTab("entrenar")}
          >
            Empezar a entrenar
          </button>
        </section>
      ) : (
        <div className="space-y-3" data-testid="registro-dia-container">
          {currentSession.ejercicios
            .filter((ej) => ej.series.some((s) => s.completada))
            .map((ej) => {
              const completedSets = ej.series.filter((s) => s.completada);
              return (
                <div key={ej.id} className="space-y-1.5">
                  <p className="a-exn">
                    <b className="a-t-bs">{ej.nombre}</b>
                    <span className="a-t-label a-muted">
                      {completedSets.length}/{ej.series.length}
                    </span>
                  </p>
                  <ol className="a-logged">
                    {completedSets.map((s) => {
                      const pending = isSetPendingOffline(ej.id, s.numero_serie);
                      const isPr = seriesRecord.has(`${ej.id}-${s.numero_serie}`);
                      return (
                        <li
                          key={s.numero_serie}
                          data-testid={`log-row-${ej.id}-${s.numero_serie}`}
                        >
                          <span className="a-t-sec">
                            <b>Serie {s.numero_serie}</b> · {formatSetLogText(ej, s)}
                            {!isSimpleView && s.rpe_real
                              ? ` · RPE ${formatAr.format(s.rpe_real)}`
                              : ""}
                          </span>
                          {isPr && (
                            <span className="a-chip a-pr a-t-label">
                              <Trophy width={11} height={11} className="a-i" /> PR
                            </span>
                          )}
                          <span className="a-stt a-t-sec">
                            {pending ? (
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
                </div>
              );
            })}

          <div className="pt-2">
            <button
              type="button"
              className="a-btn"
              disabled={isFinishing}
              onClick={() => {
                if (workoutFinished || isAllWorkoutCompleted) {
                  setShowCelebrationModal(true);
                } else {
                  void handleTerminarEntrenamiento();
                }
              }}
              data-testid="terminar-entrenamiento-btn"
            >
              {isFinishing ? "Guardando sesión…" : "Terminar sesión"}
            </button>
          </div>
        </div>
      )}

      {painModalData && (
        <PainReportModal
          isOpen={Boolean(painModalData)}
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
                ejercicioId:
                  report.ejercicioId || painModalData.ejercicioId || targetExerciseId,
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
          if (completedSetsCount > 0) {
            setToastSesion({
              mensaje: "Sesión guardada en tu historial",
              tipo: "ok",
              irAHistorial: true,
            });
          } else {
            setToastSesion({
              mensaje: "Sesión cerrada sin series",
              tipo: "neutral",
              irAHistorial: false,
            });
          }
        }}
        tonelajeKg={totalVolumeKg}
        seriesCompletadas={completedSetsCount}
        totalSeries={totalSets}
        duracionMinutos={Math.max(
          1,
          Math.round(
            (Date.now() - (sessionStartedAt ?? sessionStartTimeRef.current)) / 60000,
          ),
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

      {isSettingsOpen && (
        <div
          className="a-sheet-wrap justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSettings();
          }}
        >
          <div
            ref={settingsSheetRef}
            className="a-sheet max-w-[28rem]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
          >
            <div className="a-sh-h">
              <div>
                <h2
                  id="settings-dialog-title"
                  ref={settingsTitleRef}
                  className="a-t-h"
                  tabIndex={-1}
                >
                  Configuración
                </h2>
              </div>
              <button
                type="button"
                className="a-icon-btn"
                onClick={closeSettings}
                aria-label="Cerrar configuración"
              >
                <X width={18} height={18} className="a-i" />
              </button>
            </div>

            <label className="a-t-label a-muted" htmlFor="cfgName">
              Cómo te llamamos
            </label>
            <input
              id="cfgName"
              className="a-fin a-t-body"
              autoComplete="nickname"
              maxLength={NOMBRE_PREFERIDO_MAX_LEN}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => void handleSaveNameOnBlur()}
              data-testid="config-nombre-input"
            />

            <span className="a-t-label a-muted">Modo de visualización</span>
            <div
              className="a-seg"
              role="group"
              aria-label="Modo de visualización"
              data-testid="athlete-view-mode-container"
            >
              <button
                type="button"
                aria-pressed={isSimpleView}
                onClick={() => setNivelVistaAlumno("SIMPLE")}
                data-testid="athlete-toggle-vista-simple"
              >
                Simple
              </button>
              <button
                type="button"
                aria-pressed={!isSimpleView}
                onClick={() => setNivelVistaAlumno("TECNICA")}
                data-testid="athlete-toggle-vista-tecnica"
              >
                Técnica
              </button>
            </div>
            <div
              className="flex items-center justify-between gap-2"
              data-testid="athlete-vista-recomendada-info"
            >
              <span
                className="a-t-sec a-muted"
                data-testid="athlete-vista-recomendada-texto"
              >
                Tu coach te recomienda: {recomendadaTexto}
              </span>
              {tieneVistaDistinta && (
                <button
                  type="button"
                  className="a-link"
                  onClick={usarVistaRecomendada}
                  data-testid="athlete-usar-vista-recomendada-btn"
                >
                  Usar la recomendada
                </button>
              )}
            </div>

            <span className="a-t-label a-muted mt-1.5">
              Cuánto suman los botones de peso
            </span>
            <div className="a-chips" role="group" aria-label="Paso de incremento">
              {[1.25, 2.5, 5, 10].map((step) => (
                <button
                  key={step}
                  type="button"
                  aria-pressed={pasoPeso === step}
                  onClick={() => setPasoIncrementoPeso(step)}
                >
                  ±{formatAr.format(step)} kg
                </button>
              ))}
            </div>

            <div className="a-toggle">
              <span className="a-rt">
                <b className="a-t-bs">Mostrar el descanso</b>
                <small className="a-t-sec a-muted">Reloj después de cada serie</small>
              </span>
              <button
                type="button"
                className="a-sw2"
                role="switch"
                aria-checked={mostrarTimerDescanso}
                aria-label="Mostrar el descanso"
                onClick={() => setMostrarTimerDescanso(!mostrarTimerDescanso)}
                data-testid="toggle-mostrar-descanso"
              />
            </div>

            <button
              type="button"
              className="a-card a-row"
              onClick={() => {
                setIsSettingsOpen(false);
                setCuestionarioAbierto(true);
                setActiveTab("cuestionario");
              }}
              data-testid="tab-cuestionario"
            >
              <span className="a-rt">
                <b className="a-t-bs">Cuestionario inicial</b>
                <small className="a-t-sec">
                  {cuestionarioInicial?.completado_at ? "Completado" : "Opcional"}
                </small>
              </span>
              <ChevronRight width={18} height={18} className="a-i" />
            </button>

            <button
              type="button"
              className="a-btn a-soft"
              onClick={closeSettings}
              data-testid="config-cerrar-btn"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {nameToast && (
        <div
          className="a-toast a-ok a-show"
          role="status"
          aria-live="polite"
          data-testid="config-nombre-toast"
        >
          <span className="a-tic">
            <Check width={16} height={16} className="a-i" />
          </span>
          <span className="a-t-bs">{nameToast}</span>
        </div>
      )}
    </div>
  );
}
