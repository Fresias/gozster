"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useChatStore } from "@/store/use-chat-store";
import {
  calcularEstadosDias,
  calcularUltimoDiaRealizado,
  calcularSemanaPlan,
  etiquetaDia,
  type DiaConEstado,
  type DiaRutinaItem,
} from "@/lib/athlete-dias";
import type { MotivoCambioDia } from "@/types/database.types";

export const CHIPS_MOTIVOS_CAMBIO: Array<{
  id: MotivoCambioDia;
  label: string;
}> = [
  { id: "CANSANCIO_DEPORTE", label: "Cansancio / otro deporte" },
  { id: "MOLESTIA", label: "Molestia" },
  { id: "POCO_TIEMPO", label: "Poco tiempo" },
  { id: "EQUIPO_OCUPADO", label: "Máquina ocupada" },
];
import {
  Play,
  ArrowRightLeft,
  ChevronRight,
  Check,
  X,
} from "@/components/athlete/icons";

export function InicioMisDias() {
  const {
    currentSession,
    diaElegidoHoyId,
    motivoCambioDia,
    sesionesCompletadas,
    empezarDia,
    elegirOtroDia,
    deshacerCambioDia,
    planAlumno,
    cargandoPlan,
    cargarPlanAlumno,
    rpeReminderNotification,
  } = useAthleteStore();

  const { getLatestUnreadStaffMessage, setAthleteChatOpen } = useChatStore();
  const latestUnreadStaffMessage = getLatestUnreadStaffMessage();
  const pendingRpeExercise = currentSession.ejercicios.find(
    (ej) =>
      ej.force_rpe_required &&
      ej.series.some((s) => !s.rpe_real || s.rpe_real < 6 || s.rpe_real > 10),
  );
  const hasSuperserie = currentSession.ejercicios.some((e) => e.es_superserie);

  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [sheetSelectedDiaId, setSheetSelectedDiaId] = React.useState<string | null>(null);
  const [sheetMotivo, setSheetMotivo] = React.useState<MotivoCambioDia | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const toastTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    void cargarPlanAlumno();
  }, [cargarPlanAlumno]);

  // Alumno, plan y días reales del alumno autenticado (Supabase + RLS)
  const student = planAlumno?.alumnos[0];
  const plan = planAlumno?.planes[0];
  const diasItems: DiaRutinaItem[] = React.useMemo(() => {
    if (!planAlumno || !plan) return [];
    return planAlumno.dias
      .filter((d) => d.plan_id === plan.id)
      .sort((a, b) => a.orden - b.orden)
      .map((d) => {
        const ejerciciosCount = planAlumno.ejerciciosEnRutina.filter((er) => er.dia_id === d.id).length;
        return {
          id: d.id,
          orden: d.orden,
          nombre: d.nombre,
          plan_id: d.plan_id,
          ejerciciosCount,
          duracionMinutos: ejerciciosCount * 8 + 5,
        };
      });
  }, [planAlumno, plan]);

  const ultimoDiaRealizado = React.useMemo(() => {
    return calcularUltimoDiaRealizado(diasItems, sesionesCompletadas);
  }, [diasItems, sesionesCompletadas]);

  // Cálculo puro de estados de los días
  const {
    diasConEstado,
    diaTeTocaHoy,
    diaActivoHoy,
    cambioDeDia,
    diasHechosCount,
    totalDias,
  } = React.useMemo(() => {
    return calcularEstadosDias({
      dias: diasItems,
      sesionesSemana: sesionesCompletadas,
      diaElegidoHoyId,
    });
  }, [diasItems, sesionesCompletadas, diaElegidoHoyId]);

  // Sincronizar selección inicial del Sheet al abrir
  const handleOpenSheet = (preselectedId?: string) => {
    const targetId = preselectedId || diaActivoHoy?.id || diaTeTocaHoy?.id || null;
    setSheetSelectedDiaId(targetId);
    setSheetMotivo(targetId !== diaTeTocaHoy?.id ? motivoCambioDia : null);
    setIsSheetOpen(true);
  };

  const handleConfirmChange = () => {
    if (!sheetSelectedDiaId) return;
    const seleccionado = diasConEstado.find((d) => d.id === sheetSelectedDiaId);
    if (!seleccionado || seleccionado.estado === "DONE") return;

    const isChanging = sheetSelectedDiaId !== diaTeTocaHoy?.id;
    const motivo = isChanging ? sheetMotivo : null;
    const diaSugerido = isChanging ? diaTeTocaHoy?.id ?? null : null;

    elegirOtroDia(sheetSelectedDiaId, motivo, diaSugerido);
    setIsSheetOpen(false);

    // Mostrar toast con acción Deshacer por 5 segundos
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(`Hoy hacés el Día ${seleccionado.orden}`);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  const handleUndo = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    deshacerCambioDia();
    setSheetMotivo(null);
    setToastMessage(null);
  };

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const semanaPlan = plan ? calcularSemanaPlan(plan.fecha_inicio, plan.fecha_fin) : { actual: 1, total: null };
  const diaHero = diaActivoHoy || diasConEstado[0];

  if (diasItems.length === 0) {
    return (
      <div className="space-y-2 pt-6 pb-20 text-center" data-testid="inicio-sin-plan">
        <p className="text-sm font-medium text-muted-foreground">
          {student ? `Hola, ${student.nombre_completo.split(" ")[0]}` : "Hola"}
        </p>
        <h1 className="font-outfit text-xl font-extrabold text-foreground">
          {cargandoPlan ? "Cargando tu plan…" : "Todavía no tenés un plan asignado"}
        </h1>
        {!cargandoPlan && (
          <p className="text-sm text-muted-foreground">Tu coach te va a asignar una rutina pronto.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20" data-testid="inicio-mis-dias-container">
      {/* Saludo y Plan */}
      <div className="pt-2">
        <p className="text-sm font-medium text-muted-foreground">
          Hola, {student?.nombre_completo?.split(" ")[0] ?? ""}
        </p>
        <h1 className="font-outfit text-2xl sm:text-[26px] font-extrabold tracking-tight text-foreground mt-0.5">
          {plan?.nombre ?? "Tu plan"}
        </h1>
        <p className="text-sm font-medium text-muted-foreground mt-0.5">
          Semana{" "}
          <span className="font-mono font-bold text-foreground">{semanaPlan.actual}</span>
          {semanaPlan.total !== null && (
            <>
              {" "}de <span className="font-mono font-bold text-foreground">{semanaPlan.total}</span>
            </>
          )}
        </p>
      </div>

      {/* Indicador de Último Entrenamiento Realizado */}
      {ultimoDiaRealizado && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-secondary/60 border border-border/80 text-xs shadow-xs"
          data-testid="ultimo-entrenamiento-card"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500 font-bold">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <div className="truncate">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Último entrenamiento realizado
              </p>
              <p className="text-sm font-bold text-foreground truncate mt-0.5">
                {etiquetaDia(ultimoDiaRealizado.dia)}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span
              className="inline-block px-2.5 py-1 rounded-lg bg-background/80 border border-border/60 text-[11px] font-bold text-foreground"
              data-testid="ultimo-entrenamiento-fecha"
            >
              {ultimoDiaRealizado.tiempoRelativo
                ? `${ultimoDiaRealizado.tiempoRelativo} · ${ultimoDiaRealizado.fechaLegible}`
                : ultimoDiaRealizado.fechaLegible}
            </span>
          </div>
        </div>
      )}

      {/* Aviso prominente de mensaje no leído del Coach */}
      {latestUnreadStaffMessage && (
        <div
          role="status"
          onClick={() => setAthleteChatOpen(true)}
          className="flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/10 hover:bg-primary/15 transition-all p-3.5 text-xs text-foreground cursor-pointer shadow-xs"
          data-testid="unread-coach-message-banner"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm">
              !
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-primary">Mensaje nuevo del Coach</span>
                <span className="rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 text-[10px] font-bold">
                  No leído
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate max-w-[200px] sm:max-w-md">
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
          className="flex items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200"
          data-testid="rpe-reminder-banner"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 font-bold text-xs">
              ⚡
            </span>
            <div className="min-w-0">
              <span className="font-bold text-amber-300">RPE obligatorio (sin bloqueo):</span>{" "}
              <span className="text-amber-200/90 text-[11px]">
                {rpeReminderNotification ||
                  `Tu Coach requiere registrar RPE en "${pendingRpeExercise?.nombre || "ejercicio indicado"}". Podés cargarlo sin detener tu entrenamiento.`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Hero Oscuro (#0F172A) con el Día activo para hoy */}
      {diaHero && (
        <section
          aria-label="Día de hoy"
          className="rounded-[20px] bg-[#0F172A] p-5 text-[#F8FAFC] shadow-xl border border-slate-800"
          data-testid="hero-dia-hoy"
        >
          <div className="flex items-center gap-2 flex-wrap">
            {cambioDeDia ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider text-[#93C5FD] uppercase">
                  Hoy
                </span>
                <span
                  className="rounded-full bg-[#FDE68A] px-2 py-0.5 text-[11px] font-bold text-[#0F172A]"
                  data-testid="tag-cambiaste-dia"
                >
                  Cambiaste de día
                </span>
              </div>
            ) : (
              <span className="text-xs font-bold tracking-wider text-[#93C5FD] uppercase">
                Te toca hoy
              </span>
            )}
            {hasSuperserie && (
              <span
                data-testid="hero-superserie-badge"
                className="inline-flex items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/20 px-2 py-0.5 text-[11px] font-bold text-purple-300"
              >
                Circuito Violeta
              </span>
            )}
          </div>

          <h2 className="font-outfit text-[26px] sm:text-[28px] font-extrabold tracking-tight text-white mt-1.5 leading-tight">
            {etiquetaDia(diaHero)}
          </h2>

          <p className="text-sm font-medium text-[#CBD5E1] mt-1">
            <span className="font-mono">{diaHero.ejerciciosCount}</span> ejercicios ·{" "}
            <span className="font-mono">~{diaHero.duracionMinutos}</span> min
          </p>

          {/* CTA Principal: Empezar Día */}
          <button
            type="button"
            onClick={() => empezarDia(diaHero.id)}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#38BDF8] text-[#0F172A] text-[17px] font-bold shadow-md hover:bg-[#38BDF8]/90 active:scale-[0.97] transition-all"
            data-testid="empezar-dia-btn"
          >
            <Play className="h-5 w-5" />
            <span>Empezar Día {diaHero.orden}</span>
          </button>

          {/* Botón Secundario: Hacer otro día */}
          <button
            type="button"
            onClick={() => handleOpenSheet()}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[12px] border border-[#334155] bg-transparent text-[#F8FAFC] text-[15px] font-semibold hover:bg-slate-800/60 active:scale-[0.97] transition-all"
            data-testid="hacer-otro-dia-btn"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span>Hacer otro día</span>
          </button>
        </section>
      )}

      {/* Lista: Tus Días */}
      <section aria-label="Lista de días de rutina" className="space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
          <span>Tus días</span>
          <span className="font-mono lowercase">
            {diasHechosCount}/{totalDias} esta semana
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs divide-y divide-border">
          {diasConEstado.map((dia: DiaConEstado) => {
            const isDone = dia.estado === "DONE";
            const isToday = dia.estado === "TODAY";
            const isSkipped = dia.estado === "PENDING_SKIPPED";
            const isUltimo = ultimoDiaRealizado?.dia.id === dia.id;

            return (
              <div
                key={dia.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isDone) return;
                  if (isToday) {
                    empezarDia(dia.id);
                  } else {
                    handleOpenSheet(dia.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!isDone) {
                      if (isToday) empezarDia(dia.id);
                      else handleOpenSheet(dia.id);
                    }
                  }
                }}
                className={`flex min-h-[68px] items-center gap-3.5 px-4 py-3 cursor-pointer transition-colors ${
                  isDone
                    ? "bg-muted/10 opacity-75 cursor-default"
                    : "hover:bg-secondary/40 active:bg-secondary/60"
                }`}
                data-testid={`dia-row-${dia.id}`}
              >
                {/* Badge con el Número o Check */}
                <div
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl font-mono text-lg font-extrabold ${
                    isDone
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : isToday
                      ? "bg-primary text-primary-foreground"
                      : isSkipped
                      ? "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {isDone ? <Check className="h-5 w-5 stroke-[2.5]" /> : dia.orden}
                </div>

                {/* Título y Subtítulo descriptivo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="text-base font-bold text-foreground truncate">
                      {etiquetaDia(dia)}
                    </b>
                    {isUltimo && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500"
                        data-testid={`badge-ultimo-realizado-${dia.id}`}
                      >
                        Último realizado
                      </span>
                    )}
                  </div>
                  <span
                    className={`block text-[13px] truncate ${
                      isToday
                        ? "text-primary font-semibold"
                        : isSkipped
                        ? "text-[#B45309] font-semibold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {dia.subtitulo}
                  </span>
                </div>

                {/* Chevron */}
                {!isDone && (
                  <ChevronRight className="h-5 w-5 flex-none text-muted-foreground/60" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Sheet Inferior: ¿Qué día querés hacer hoy? */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsSheetOpen(false)}
            data-testid="sheet-backdrop"
          />

          {/* Panel inferior */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            className="relative z-50 w-full max-w-md mx-auto rounded-t-[24px] bg-card p-5 pb-8 shadow-2xl border-t border-border animate-in slide-in-from-bottom duration-200"
            data-testid="sheet-cambiar-dia"
          >
            {/* Grab handle */}
            <div className="mx-auto h-1.5 w-10 rounded-full bg-muted-foreground/30 mb-3" />

            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 id="sheet-title" className="font-outfit text-2xl font-extrabold tracking-tight text-foreground">
                  ¿Qué día querés hacer hoy?
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  El Día {diaTeTocaHoy?.orden ?? 1} no se pierde: queda como el próximo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSheetOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary/60"
                aria-label="Cerrar selector de día"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Opciones de días */}
            <div className="mt-4 space-y-2.5 max-h-[50vh] overflow-y-auto">
              {diasConEstado.map((dia: DiaConEstado) => {
                const isDone = dia.estado === "DONE";
                const isSelected = sheetSelectedDiaId === dia.id;
                const isNaturalNext = dia.id === diaTeTocaHoy?.id;

                if (isDone) {
                  return (
                    <div
                      key={dia.id}
                      className="flex min-h-[64px] items-center gap-3.5 rounded-2xl bg-secondary/40 border border-secondary px-4 py-3 opacity-80 cursor-not-allowed"
                    >
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-card text-emerald-600 dark:text-emerald-400">
                        <Check className="h-5 w-5 stroke-[2.5]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <b className="block text-base font-bold text-muted-foreground truncate">
                          {etiquetaDia(dia)}
                        </b>
                        <span className="block text-xs text-muted-foreground">
                          Ya lo hiciste esta semana
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={dia.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSheetSelectedDiaId(dia.id);
                      if (dia.id === diaTeTocaHoy?.id) {
                        setSheetMotivo(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSheetSelectedDiaId(dia.id);
                      }
                    }}
                    className={`flex min-h-[68px] items-center gap-3.5 rounded-2xl border-2 px-4 py-3 cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-xs"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                    data-testid={`sheet-option-dia-${dia.id}`}
                  >
                    <div
                      className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl font-mono text-base font-extrabold ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {dia.orden}
                    </div>

                    <div className="flex-1 min-w-0">
                      <b className="block text-base font-bold text-foreground truncate">
                        {etiquetaDia(dia)}
                      </b>
                      <span className="block text-xs text-muted-foreground">
                        {isNaturalNext
                          ? "El que te tocaba"
                          : `${dia.ejerciciosCount} ejercicios · ~${dia.duracionMinutos} min`}
                      </span>
                    </div>

                    {/* Radio indicator */}
                    <div
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 transition-all ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40 bg-transparent"
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sección ¿Por qué cambiás? (opcional) - visible cuando se cambia de día */}
            {Boolean(sheetSelectedDiaId && sheetSelectedDiaId !== diaTeTocaHoy?.id) && (
              <div className="mt-4 pt-1" data-testid="seccion-motivo-cambio-dia">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  ¿Por qué cambiás? (opcional)
                </label>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Motivo del cambio de día"
                >
                  {CHIPS_MOTIVOS_CAMBIO.map((chip) => {
                    const isSelected = sheetMotivo === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSheetMotivo((prev) => (prev === chip.id ? null : chip.id))
                        }
                        className={`flex h-11 items-center justify-center rounded-full px-3.5 text-sm font-semibold transition-all active:scale-[0.97] border ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary dark:text-blue-400 font-bold shadow-xs"
                            : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary/40"
                        }`}
                        data-testid={`chip-motivo-${chip.id.toLowerCase()}`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Confirm button */}
            <button
              type="button"
              onClick={handleConfirmChange}
              disabled={!sheetSelectedDiaId}
              className="mt-5 flex h-14 w-full items-center justify-center rounded-[14px] bg-primary text-primary-foreground text-[17px] font-bold shadow-md hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50 transition-all"
              data-testid="confirmar-cambio-dia-btn"
            >
              Hacer Día {diasConEstado.find((d) => d.id === sheetSelectedDiaId)?.orden ?? 1} hoy
            </button>
          </div>
        </div>
      )}

      {/* Toast con Deshacer (~5 s) */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-[14px] bg-[#0F172A] px-4 py-3 text-white shadow-2xl flex items-center justify-between border border-slate-800 animate-in fade-in slide-in-from-bottom duration-150"
          data-testid="toast-cambio-dia"
        >
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <Check className="h-5 w-5 text-emerald-400 stroke-[2.5]" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={handleUndo}
            className="flex min-h-11 items-center px-2 text-sm font-bold text-[#38BDF8] hover:underline"
            data-testid="deshacer-cambio-dia-btn"
          >
            Deshacer
          </button>
        </div>
      )}
    </div>
  );
}
