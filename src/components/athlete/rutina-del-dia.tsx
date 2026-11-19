"use client";

import * as React from "react";
import { type LiveWorkoutExercise } from "@/store/use-athlete-store";
import { ejercicioBloqueado } from "@/lib/athlete/molestias";
import { isWarmup } from "@/lib/serie-tipo";
import { PainReportModal } from "@/components/athlete/pain-report-modal";
import { CierreDiaModal } from "@/components/athlete/cierre-dia-modal";
import { CuestionarioInicial } from "@/components/athlete/cuestionario-inicial";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Settings,
  Timer,
  TriangleAlert,
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

export function RutinaDelDia() {
  const {
    currentSession,
    reportPainForSet,
    reportarMolestia,
    volverAlInicio,
    setEjercicioAbiertoId,
    setSelectedExerciseId,
    setCierreAbierto,
    setCuestionarioAbierto,
    sesionesCompletadas,
    planAlumno,
    isSimpleView,
    activeTab,
    setActiveTab,
    workoutTab,
    setWorkoutTab,
    setIsSettingsOpen,
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
    totalSets,
    completedSetsCount,
    completedExercisesCount,
    totalExercises,
    totalVolumeKg,
    effectiveVolumeKg,
    latestUnreadStaffMessage,
    setAthleteChatOpen,
    handleTerminarEntrenamiento,
    cleanDiaTitle,
    isAllWorkoutCompleted,
  } = useLiveWorkout();

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

  const openExercise = (exerciseId: string) => {
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
          <span className="a-chip a-bad a-t-label">
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

          <button
            type="button"
            className={`a-btn${nextExercise ? " a-ghost" : ""}`}
            disabled={isFinishing}
            onClick={() => {
              if (workoutFinished || isAllWorkoutCompleted) {
                setShowCelebrationModal(true);
              } else {
                void handleTerminarEntrenamiento();
              }
            }}
            data-testid="terminar-entrenamiento-btn-entrenar"
          >
            {isFinishing ? "Guardando sesión…" : "Terminar sesión"}
          </button>
        </>
      ) : (
        <div className="space-y-3" data-testid="registro-dia-container">
          <section className="a-card a-state">
            <b className="a-t-bs">Todavía no guardaste ninguna serie hoy</b>
            <button
              type="button"
              className="a-btn a-soft"
              onClick={() => setWorkoutTab("entrenar")}
            >
              Empezar a entrenar
            </button>
          </section>
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
          onSavePainReport={(report) => {
            if (typeof report === "string") {
              reportPainForSet(painModalData.exerciseId, painModalData.setNumber, report);
            } else {
              void reportarMolestia({
                ejercicioEnRutinaId: painModalData.exerciseId,
                ejercicioId:
                  report.ejercicioId || painModalData.ejercicioId || painModalData.exerciseId,
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
        duracionMinutos={
          Math.max(
            1,
            Math.round(
              (Date.now() - (sessionStartedAt ?? sessionStartTimeRef.current)) / 60000,
            ),
          ) || 45
        }
        rachaDias={Math.max(1, (sesionesCompletadas?.length || 0) + 1)}
        rachaPrevia={Math.max(0, sesionesCompletadas?.length || 0)}
        metaDiasSemana={planAlumno?.dias?.length || 3}
        diasCompletadosSemana={Math.min(
          planAlumno?.dias?.length || 3,
          Math.max(1, (sesionesCompletadas?.length || 0) + 1),
        )}
        recordsObtenidos={sessionPRs}
        studentName={currentSession.studentName || ""}
        diaNombre={cleanDiaTitle || "Día 1"}
      />
    </div>
  );
}
