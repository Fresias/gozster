"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useChatStore } from "@/store/use-chat-store";
import {
  calcularEstadosDias,
  calcularSemanaPlan,
  etiquetaDia,
  primerNombre,
  saludoAlumno,
  type DiaConEstado,
  type DiaRutinaItem,
} from "@/lib/athlete-dias";
import { nombreParaSaludo } from "@/lib/athlete/nombre";

export { primerNombre, saludoAlumno };
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
  MessageSquare,
  TriangleAlert,
  TrendingUp,
  ClipboardList,
} from "@/components/athlete/icons";
import { InstalarAppCard } from "@/components/athlete/instalar-app-card";

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
    errorPlan,
    cargarPlanAlumno,
    rpeReminderNotification,
    nombrePreferido,
  } = useAthleteStore();

  const { getLatestUnreadStaffMessage, setAthleteChatOpen } = useChatStore();
  const latestUnreadStaffMessage = getLatestUnreadStaffMessage();
  const pendingRpeExercise = currentSession.ejercicios.find(
    (ej) =>
      ej.force_rpe_required &&
      ej.series.some((s) => !s.rpe_real || s.rpe_real < 6 || s.rpe_real > 10),
  );

  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [sheetSelectedDiaId, setSheetSelectedDiaId] = React.useState<string | null>(null);
  const [sheetMotivo, setSheetMotivo] = React.useState<MotivoCambioDia | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const toastTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Lógica de Recordatorio Mensual de Peso Corporal (GOZS-345)
  const [recordatorioDescartado, setRecordatorioDescartado] = React.useState(false);
  const [nuevoPesoKg, setNuevoPesoKg] = React.useState<string>("");
  const [guardandoPeso, setGuardandoPeso] = React.useState(false);
  const [pesoGuardadoMensaje, setPesoGuardadoMensaje] = React.useState<string | null>(null);

  const [mostrarCargando, setMostrarCargando] = React.useState(false);

  React.useEffect(() => {
    void cargarPlanAlumno();
  }, [cargarPlanAlumno]);

  React.useEffect(() => {
    if (!cargandoPlan || planAlumno !== null) {
      setMostrarCargando(false);
      return;
    }
    const timer = setTimeout(() => {
      setMostrarCargando(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cargandoPlan, planAlumno]);

  // Alumno, plan y días reales del alumno autenticado (Supabase + RLS)
  const student = planAlumno?.alumnos[0];

  // Lógica de Recordatorio Mensual de Peso Corporal (GOZS-345)
  const diasSinActualizarPeso = React.useMemo(() => {
    if (!student) return 0;
    if (student.peso_corporal_kg === null || student.peso_corporal_kg === undefined) {
      return 999; // Sin peso registrado -> mostrar aviso
    }
    const fechaRef = (student as any).fecha_actualizacion_peso || student.updated_at || student.created_at;
    if (!fechaRef) return 999;
    const diffMs = Date.now() - new Date(fechaRef).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [student]);

  const debeRecordarPeso = !recordatorioDescartado && diasSinActualizarPeso >= 30;

  const handleGuardarPeso = async () => {
    const pesoNum = parseFloat(nuevoPesoKg);
    if (isNaN(pesoNum) || pesoNum <= 0 || pesoNum > 500) {
      setToastMessage("Por favor ingresá un peso válido en kg (ej: 75.5)");
      return;
    }
    setGuardandoPeso(true);
    try {
      if (student) {
        student.peso_corporal_kg = pesoNum;
        student.updated_at = new Date().toISOString();
        (student as any).fecha_actualizacion_peso = new Date().toISOString();
      }
      try {
        const { supabase } = await import("@/lib/supabase/client");
        if (student?.id) {
          await supabase
            .from("perfiles")
            .update({
              peso_corporal_kg: pesoNum,
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", student.id);
        }
      } catch (err) {
        console.warn("Actualización de peso offline:", err);
      }
      setPesoGuardadoMensaje(`¡Peso guardado: ${pesoNum} kg!`);
      setTimeout(() => {
        setRecordatorioDescartado(true);
      }, 2000);
    } finally {
      setGuardandoPeso(false);
    }
  };
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
  const sesionIniciada = Boolean(
    diaHero &&
      currentSession.dia_id === diaHero.id &&
      currentSession.ejercicios.some((ej) => ej.series.some((s) => s.completada)),
  );
  const hasSuperserie = Boolean(
    diaHero &&
      (planAlumno?.ejerciciosEnRutina.some(
        (er) => er.dia_id === diaHero.id && Boolean(er.es_superserie),
      ) ||
        (currentSession.dia_id === diaHero.id &&
          currentSession.ejercicios.some((e) => e.es_superserie))),
  );
  const saludoNombre = nombreParaSaludo({
    nombre_preferido:
      nombrePreferido ??
      (student as { nombre_preferido?: string | null } | undefined)?.nombre_preferido,
    nombre_completo: student?.nombre_completo,
  });
  const saludoTexto = saludoNombre ? `Hola, ${saludoNombre}` : "Hola";

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleOpenOtherDay = (preselectedId?: string) => {
    if (sesionIniciada) {
      showToast("Terminá la sesión actual antes de cambiar de día.");
      return;
    }
    handleOpenSheet(preselectedId);
  };

  const handlePickDay = (dia: DiaConEstado) => {
    if (dia.estado === "DONE") return;
    if (diaHero && dia.id === diaHero.id) {
      empezarDia(dia.id);
      return;
    }
    handleOpenOtherDay(dia.id);
  };

  const tarjetaRecordatorioPeso = debeRecordarPeso ? (
    <div
      role="region"
      aria-label="Recordatorio de peso corporal"
      className="a-card p-4 space-y-3 text-left"
      data-testid="recordatorio-peso-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--a-primary)", color: "var(--a-on-primary)" }}
          >
            <TrendingUp width={18} height={18} className="a-i" />
          </span>
          <div>
            <p className="a-t-bs">
              Actualizá tu peso corporal para calibrar tus marcas de fuerza (kg)
            </p>
            <p className="a-t-sec a-muted mt-0.5">
              {student?.peso_corporal_kg
                ? `Último registro: ${student.peso_corporal_kg} kg (hace ${diasSinActualizarPeso} días)`
                : "Calibración en kilogramos puros sin métricas invasivas"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setRecordatorioDescartado(true)}
          className="a-icon-btn"
          aria-label="Descartar recordatorio"
          data-testid="descartar-recordatorio-peso-btn"
        >
          <X width={16} height={16} className="a-i" />
        </button>
      </div>

      {pesoGuardadoMensaje ? (
        <div
          className="a-oknote a-t-sec font-semibold"
          data-testid="peso-guardado-feedback"
        >
          <Check width={16} height={16} className="a-i" />
          <span>{pesoGuardadoMensaje}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="relative flex-1 min-w-[130px] max-w-[200px]">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="20"
              max="400"
              placeholder={student?.peso_corporal_kg ? String(student.peso_corporal_kg) : "Ej: 75.0"}
              value={nuevoPesoKg}
              onChange={(e) => setNuevoPesoKg(e.target.value)}
              className="a-t-body w-full min-h-11 rounded-2xl border border-input bg-card px-3 pr-9 text-foreground"
              data-testid="input-peso-corporal"
              aria-label="Nuevo peso corporal en kilogramos"
            />
            <span className="a-t-sec a-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              kg
            </span>
          </div>

          <button
            type="button"
            disabled={!nuevoPesoKg || guardandoPeso}
            onClick={handleGuardarPeso}
            className="a-mini min-h-11"
            data-testid="btn-guardar-peso-corporal"
          >
            {guardandoPeso ? "Guardando…" : "Actualizar"}
          </button>
        </div>
      )}
    </div>
  ) : null;

  const bannerMensajeNoLeido = latestUnreadStaffMessage ? (
    <button
      type="button"
      onClick={() => setAthleteChatOpen(true)}
      className="a-card a-coachmsg w-full text-left"
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
  ) : null;

  if (diasItems.length === 0) {
    if (!planAlumno) {
      if (errorPlan) {
        return (
          <div className="a-view a-anim" data-testid="inicio-error">
            <section className="a-card a-state" role="alert">
              <span className="a-ic">
                <TriangleAlert width={24} height={24} className="a-i" />
              </span>
              <h2 className="a-t-title">No pudimos cargar tu plan</h2>
              <p className="a-t-sec">
                Pasó algo de nuestro lado. Tus series guardadas no se perdieron.
              </p>
              <button
                type="button"
                className="a-btn"
                onClick={() => void cargarPlanAlumno()}
                data-testid="reintentar-plan-btn"
              >
                Reintentar
              </button>
            </section>
          </div>
        );
      }

      if (!mostrarCargando) {
        return <div className="a-view" data-testid="inicio-cargando-espera" />;
      }

      return (
        <div className="a-view a-anim" data-testid="inicio-cargando">
          {saludoNombre && (
            <div className="a-hello">
              <span className="a-t-sec a-muted">{saludoTexto}</span>
            </div>
          )}
          <section className="a-card a-state" role="status">
            <div className="a-loading" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <b className="a-t-bs">Cargando tu plan…</b>
            <p className="a-t-sec">
              Si tarda, revisá la señal. Lo último que viste queda guardado.
            </p>
          </section>
        </div>
      );
    }

    return (
      <div className="a-view a-anim" data-testid="inicio-sin-plan">
        <div className="a-hello">
          <span className="a-t-sec a-muted">{saludoTexto}</span>
        </div>
        {bannerMensajeNoLeido}
        {tarjetaRecordatorioPeso}
        <section className="a-card a-state">
          <span className="a-ic">
            <ClipboardList width={24} height={24} className="a-i" />
          </span>
          <h2 className="a-t-title">Todavía no tenés un plan</h2>
          <p className="a-t-sec">
            Tu coach te lo va a asignar pronto. Mientras, podés escribirle.
          </p>
          <button
            type="button"
            className="a-btn"
            onClick={() => setAthleteChatOpen(true)}
            data-testid="sin-plan-chat-btn"
          >
            Escribirle al coach
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="a-view a-anim" data-testid="inicio-mis-dias-container">
      {/* Saludo y Plan */}
      <div className="a-hello">
        <span className="a-t-sec a-muted">{saludoTexto}</span>
        <h1 className="a-t-d uppercase">{plan?.nombre ?? "Tu plan"}</h1>
        <span className="a-t-sec a-muted">
          Semana {semanaPlan.actual}
          {semanaPlan.total !== null ? ` de ${semanaPlan.total}` : ""}
        </span>
      </div>

      {/* Aviso prominente de mensaje no leído del Coach */}
      {bannerMensajeNoLeido}

      {/* Tarjeta de instalación PWA (iPhone / Android) */}
      <InstalarAppCard />

      {/* Recordatorio Mensual de Peso Corporal (kg puro) (GOZS-345) */}
      {tarjetaRecordatorioPeso}

      {/* Recordatorio de RPE obligatorio sin bloqueo */}
      {(rpeReminderNotification || pendingRpeExercise) && (
        <section
          role="alert"
          className="a-banner"
          data-testid="rpe-reminder-banner"
        >
          <b className="a-t-bs">
            <TriangleAlert width={18} height={18} className="a-i" />
            RPE obligatorio (sin bloqueo)
          </b>
          <span className="a-t-sec">
            {rpeReminderNotification ||
              `Tu Coach requiere registrar RPE en "${pendingRpeExercise?.nombre || "ejercicio indicado"}". Podés cargarlo sin detener tu entrenamiento.`}
          </span>
        </section>
      )}

      {/* Héroe "Te toca hoy" (invertido de noche) */}
      {diaHero && (
        <section
          aria-label="Te toca hoy"
          className="a-hero"
          data-testid="heroe-te-toca-hoy"
        >
          <div className="a-hp" data-testid="hero-dia-hoy">
            <div className="a-hrow2">
              {cambioDeDia ? (
                <>
                  <span className="a-t-label a-eh">Hoy</span>
                  <span className="a-chip a-t-label" data-testid="tag-cambiaste-dia">
                    Cambiaste de día
                  </span>
                </>
              ) : (
                <span className="a-t-label a-eh">Te toca hoy</span>
              )}
              {hasSuperserie && (
                <span className="a-chip a-t-label" data-testid="hero-superserie-badge">
                  Con biserie
                </span>
              )}
            </div>

            <h2 className="a-t-d mt-[6px]">Día {diaHero.orden}</h2>
            <small className="a-t-sec">
              {diaHero.ejerciciosCount} ejercicios · ~{diaHero.duracionMinutos} min
            </small>
          </div>

          <button
            type="button"
            onClick={() => empezarDia(diaHero.id)}
            className="a-btn a-hbtn a-gym"
            data-testid="empezar-dia-btn"
          >
            <Play width={16} height={16} className="a-i" />
            <span>
              {sesionIniciada ? "Seguir" : "Empezar"} Día {diaHero.orden}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenOtherDay()}
            className="a-btn a-hero-ghost"
            data-testid="hacer-otro-dia-btn"
          >
            <ArrowRightLeft width={16} height={16} className="a-i" />
            <span>Hacer otro día</span>
          </button>
        </section>
      )}

      {/* Lista: Tus Días */}
      <div className="flex items-baseline justify-between">
        <p className="a-eb a-t-label">Tus días</p>
        <span className="a-t-label a-muted">
          {diasHechosCount}/{totalDias} esta semana
        </span>
      </div>

      <section className="a-card a-days" aria-label="Lista de días de rutina">
        {diasConEstado.map((dia: DiaConEstado) => {
          const isDone = dia.estado === "DONE";
          const isToday = dia.estado === "TODAY";
          const isSkipped = dia.estado === "PENDING_SKIPPED";
          const subtitle = isToday
            ? cambioDeDia
              ? "Hoy"
              : "Te toca hoy"
            : isSkipped
              ? dia.subtitulo
              : `${dia.ejerciciosCount} ejercicios · ~${dia.duracionMinutos} min`;

          return (
            <button
              key={dia.id}
              type="button"
              onClick={() => handlePickDay(dia)}
              className={`a-row ${isToday ? "a-today" : ""}`}
              data-testid={`dia-row-${dia.id}`}
            >
              <span className="a-num">{dia.orden}</span>
              <span className="a-rt">
                <b className="a-t-bs">{etiquetaDia(dia)}</b>
                <small className="a-t-sec">{subtitle}</small>
              </span>
              {isDone ? (
                <span className="a-chip a-ok a-t-label">
                  <Check width={12} height={12} className="a-i" />
                  Hecho
                </span>
              ) : (
                <ChevronRight width={18} height={18} className="a-i" />
              )}
            </button>
          );
        })}
      </section>

      {/* Sheet Inferior: ¿Qué día querés hacer hoy? */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-xs transition-opacity"
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
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-card text-success">
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
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
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
              className="mt-5 flex h-14 w-full items-center justify-center rounded-[14px] bg-primary text-primary-foreground text-base font-bold shadow-md hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50 transition-all"
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
          className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-[14px] bg-[#0F172A] px-4 py-3 text-white shadow-2xl flex items-center justify-between border border-border animate-in fade-in slide-in-from-bottom duration-150"
          data-testid="toast-cambio-dia"
        >
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <Check className="h-5 w-5 text-success stroke-[2.5]" />
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
