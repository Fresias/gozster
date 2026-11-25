"use client";

import * as React from "react";
import Link from "next/link";
import { DEFAULT_ATHLETE_ID, useAthleteStore } from "@/store/use-athlete-store";
import { useChatStore } from "@/store/use-chat-store";
import { useClasesStore } from "@/store/use-clases-store";
import { getStorageUser } from "@/lib/user-storage";
import { createClient } from "@/lib/supabase/browser";
import {
  calcularEstadosDias,
  calcularRachaSemanas,
  calcularSemanaPlan,
  estimarDuracionDiaMinutos,
  etiquetaDia,
  primerNombre,
  saludoAlumno,
  type DiaConEstado,
  type DiaRutinaItem,
} from "@/lib/athlete-dias";
import {
  ACTIVIDAD_LABEL,
  SENSACIONES_CLASE,
  clasesUsadas,
  derivarAsistenciasLocal,
  formatearFechaClaseAsistencia,
  obtenerClasePendienteFeedback,
  obtenerProximaClaseReservada,
  resolverActividadesHabilitadas,
  semanaEnCurso,
} from "@/lib/clases";

export { primerNombre, saludoAlumno };
import type { ActividadClase, MotivoCambioDia } from "@/types/database.types";

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
  Calendar,
  ChevronRight,
  Check,
  X,
  MessageSquare,
  TriangleAlert,
  TrendingUp,
  ClipboardList,
  RachaFlama,
  especificacionRacha,
} from "@/components/athlete/icons";
import { InstalarAppCard } from "@/components/athlete/instalar-app-card";
import { useAtraparFocoEnHoja } from "@/components/athlete/athlete-sheet";

export interface IndicadorRachaSemanasProps {
  semanas: number;
  diamantes?: number;
  initialPopoverOpen?: boolean;
}

/**
 * Indicador compacto de racha semanal por categorías (Hierro → Bronce → Oro → Diamante)
 * con chip dual desde la semana 53 y popover accesible explicativo al tocar.
 */
export function IndicadorRachaSemanas({
  semanas,
  diamantes = 0,
  initialPopoverOpen = false,
}: IndicadorRachaSemanasProps) {
  const [popoverOpen, setPopoverOpen] = React.useState(initialPopoverOpen);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const spec = especificacionRacha(semanas, diamantes);

  React.useEffect(() => {
    if (!popoverOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const isNode = typeof Node !== "undefined" ? target instanceof Node : Boolean(target);
      if (wrapRef.current && isNode && !wrapRef.current.contains(target as Node)) {
        setPopoverOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPopoverOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [popoverOpen]);

  const semanasTexto = `${semanas} ${semanas === 1 ? "semana" : "semanas"}`;
  const ariaLabel = spec.esChipDual
    ? `Racha de ${semanasTexto} (semana ${spec.semanaCiclo} del ciclo, Categoría ${spec.etiquetaCategoria}) · Logro Llama Diamante ×${spec.diamantes}`
    : `Racha de ${semanasTexto} · Categoría ${spec.etiquetaCategoria}`;

  return (
    <div
      ref={wrapRef}
      className="a-racha-wrap"
      data-testid="racha-semanas-wrap"
      data-dual={spec.esChipDual ? "true" : undefined}
    >
      {spec.esChipDual && (
        <span
          className="a-racha-perm-mini"
          data-testid="racha-diamante-chip"
          data-category="diamante"
          data-level={4}
          data-sparks={12}
          title={`Logro permanente: Llama Diamante ×${spec.diamantes}`}
          aria-label={`Logro permanente: Llama Diamante ×${spec.diamantes}`}
        >
          <RachaFlama semanas={52} permanente width={15} height={15} className="a-i" />
          <span>×{spec.diamantes}</span>
        </span>
      )}

      <button
        ref={buttonRef}
        type="button"
        className="a-racha-btn"
        data-testid="racha-semanas-chip"
        data-category={spec.categoria}
        data-level={spec.nivel}
        data-fill-pct={spec.porcentajeLlenado}
        data-bars={spec.barras.activas}
        data-bar-animated={String(spec.barras.animada)}
        data-gold-step={spec.escalonOro ? spec.escalonOro.escalon : undefined}
        data-sparks={spec.chispas ? spec.chispas.cantidad : undefined}
        data-cycle-week={spec.semanaCiclo}
        aria-label={ariaLabel}
        aria-expanded={popoverOpen}
        aria-haspopup="dialog"
        onClick={() => setPopoverOpen((prev) => !prev)}
      >
        <RachaFlama
          semanas={spec.semanaCiclo}
          diamantes={spec.diamantes}
          width={16}
          height={16}
          className="a-i"
        />
        <span>{spec.semanaCiclo} SEM</span>
      </button>

      {popoverOpen && (
        <div
          role="dialog"
          aria-label="Detalle de racha semanal"
          className="a-racha-popover"
          data-testid="racha-popover"
        >
          <b className="a-t-bs block">
            {semanas} {semanas === 1 ? "semana consecutiva" : "semanas consecutivas"}
          </b>
          <span className="a-t-sec block" data-testid="racha-popover-categoria">
            Categoría {spec.etiquetaCategoria} · {spec.porcentajeLlenado}%
            {spec.diamantes >= 1 ? ` · Llama Diamante ×${spec.diamantes}` : ""}
          </span>
          <small className="a-t-sec a-muted">
            Sumás racha completando al menos 1 sesión por semana. La semana en curso no corta tu racha mientras siga abierta.
          </small>
        </div>
      )}
    </div>
  );
}

export function InicioMisDias() {
  const {
    currentSession,
    diaElegidoHoyId,
    motivoCambioDia,
    sesionesCompletadas,
    fechasSesionesServidor,
    historialSesiones,
    empezarDia,
    elegirOtroDia,
    deshacerCambioDia,
    planAlumno,
    cargandoPlan,
    errorPlan,
    cargarPlanAlumno,
    rpeReminderNotification,
    diamantesRacha,
    verificarYRegistrarLogroDiamante,
  } = useAthleteStore();

  const clases = useClasesStore((s) => s.clases);
  const misReservas = useClasesStore((s) => s.misReservas);
  const membresiaClases = useClasesStore((s) => s.membresia);
  const planClases = useClasesStore((s) => s.plan);
  const contratacionesAlumno = useClasesStore((s) => s.contratacionesAlumno);
  const actividadesAlumno = useClasesStore((s) => s.actividadesAlumno);
  const actividadesHabilitadas = useClasesStore((s) => s.actividadesHabilitadas);
  const resumenClases = useClasesStore((s) => s.resumenClases);
  const feedbacksPorReserva = useClasesStore((s) => s.feedbacksPorReserva);
  const testAhoraClases = useClasesStore((s) => s.testAhora);
  const cargarClasesAlumno = useClasesStore((s) => s.cargarClasesAlumno);
  const responderFeedbackClase = useClasesStore((s) => s.responderFeedbackClase);
  const subscribeClasesRealtime = useClasesStore((s) => s.subscribeToRealtime);

  const { getLatestUnreadPushStaffMessage, setAthleteChatOpen } = useChatStore();
  const [authUserId, setAuthUserId] = React.useState<string | null>(() => getStorageUser());
  React.useEffect(() => {
    let active = true;
    if (!authUserId) {
      createClient()
        .auth.getUser()
        .then(({ data }) => {
          if (active && data?.user?.id) {
            setAuthUserId(data.user.id);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [authUserId]);

  const sessionStudentId =
    currentSession.studentId && currentSession.studentId !== DEFAULT_ATHLETE_ID
      ? currentSession.studentId
      : undefined;
  const resolvedAlumnoId =
    planAlumno?.alumnos[0]?.id || sessionStudentId || authUserId || undefined;
  const latestUnreadStaffMessage = getLatestUnreadPushStaffMessage(resolvedAlumnoId);
  const pendingRpeExercise = currentSession.ejercicios.find(
    (ej) =>
      ej.force_rpe_required &&
      ej.series.some((s) => !s.rpe_real || s.rpe_real < 6 || s.rpe_real > 10),
  );

  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [sheetSelectedDiaId, setSheetSelectedDiaId] = React.useState<string | null>(null);
  const [sheetMotivo, setSheetMotivo] = React.useState<MotivoCambioDia | null>(null);
  const [toastState, setToastState] = React.useState<{
    message: string;
    variant: "ok" | "warn";
    canUndo?: boolean;
  } | null>(null);
  const toastTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const daySheetTitleRef = React.useRef<HTMLHeadingElement>(null);
  const daySheetRef = React.useRef<HTMLDivElement>(null);
  const daySheetTriggerRef = React.useRef<HTMLElement | null>(null);

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
    void cargarClasesAlumno();
  }, [cargarClasesAlumno]);

  React.useEffect(() => {
    if (!resolvedAlumnoId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedAlumnoId)) {
      return;
    }
    return subscribeClasesRealtime(resolvedAlumnoId);
  }, [resolvedAlumnoId, subscribeClasesRealtime]);

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

  const showToast = (message: string, variant: "ok" | "warn" = "ok", canUndo = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastState({ message, variant, canUndo });
    toastTimerRef.current = setTimeout(() => {
      setToastState(null);
    }, canUndo ? 5000 : 4500);
  };

  const handleGuardarPeso = async () => {
    const pesoNum = parseFloat(nuevoPesoKg);
    if (isNaN(pesoNum) || pesoNum <= 0 || pesoNum > 500) {
      showToast("Por favor ingresá un peso válido en kg (ej: 75.5)", "warn");
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
        const ejerciciosDia = planAlumno.ejerciciosEnRutina.filter((er) => er.dia_id === d.id);
        const ejerciciosCount = ejerciciosDia.length;
        return {
          id: d.id,
          orden: d.orden,
          nombre: d.nombre,
          plan_id: d.plan_id,
          ejerciciosCount,
          duracionMinutos: ejerciciosCount > 0 ? estimarDuracionDiaMinutos(ejerciciosDia) : 0,
        };
      });
  }, [planAlumno, plan]);

  // Cálculo puro de estados de los días
  const {
    diasConEstado,
    diaTeTocaHoy,
    diaActivoHoy,
    cambioDeDia,
  } = React.useMemo(() => {
    return calcularEstadosDias({
      dias: diasItems,
      sesionesSemana: sesionesCompletadas,
      diaElegidoHoyId,
    });
  }, [diasItems, sesionesCompletadas, diaElegidoHoyId]);

  const closeDaySheet = React.useCallback(() => {
    setIsSheetOpen(false);
    daySheetTriggerRef.current?.focus();
  }, []);

  useAtraparFocoEnHoja(isSheetOpen, daySheetRef, daySheetTitleRef, closeDaySheet);

  React.useEffect(() => {
    if (!isSheetOpen) return;
    daySheetTitleRef.current?.focus();
  }, [isSheetOpen]);

  // Sincronizar selección inicial del Sheet al abrir
  const handleOpenSheet = (preselectedId?: string) => {
    daySheetTriggerRef.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
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

    showToast(`Hoy hacés el Día ${seleccionado.orden}`, "ok", true);
  };

  const handleUndo = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    deshacerCambioDia();
    setSheetMotivo(null);
    setToastState(null);
  };

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const semanaPlan = plan ? calcularSemanaPlan(plan.fecha_inicio, plan.fecha_fin) : { actual: 1, total: null };
  const fechasSesiones = React.useMemo(
    () => [
      student?.ultimo_entreno_at,
      ...(fechasSesionesServidor ?? []),
      ...sesionesCompletadas.map((s) => s.fecha),
      ...historialSesiones.map((h) => h.sesion?.fecha),
    ],
    [student?.ultimo_entreno_at, fechasSesionesServidor, sesionesCompletadas, historialSesiones],
  );
  const rachaSemanas = React.useMemo(
    () => calcularRachaSemanas(fechasSesiones),
    [fechasSesiones],
  );
  const ahoraClases = React.useMemo(
    () => (testAhoraClases ? new Date(testAhoraClases) : new Date()),
    [testAhoraClases],
  );
  const proximaClaseReservada = React.useMemo(
    () => obtenerProximaClaseReservada(misReservas, clases, ahoraClases),
    [misReservas, clases, ahoraClases],
  );
  const resumenClasesInicio = React.useMemo(() => {
    const habilitadas =
      actividadesHabilitadas.length > 0
        ? actividadesHabilitadas
        : resolverActividadesHabilitadas({
            contrataciones: contratacionesAlumno,
            actividadesAlumno,
            membresia: membresiaClases,
            plan: planClases,
            ahora: ahoraClases,
          });
    const tieneMembresiaClases =
      habilitadas.length > 0 ||
      Boolean(
        planClases &&
          (!membresiaClases ||
            (membresiaClases.estado !== "VENCIDA" && membresiaClases.estado !== "EN_PAUSA")),
      );
    const habilitadasSet = new Set<ActividadClase>(habilitadas);
    const { inicio, fin } = semanaEnCurso(ahoraClases);
    const inicioMs = inicio.getTime();
    const finMs = fin.getTime();
    const clasesSemana = clases.filter((c) => {
      if (habilitadasSet.size > 0 && !habilitadasSet.has(c.actividad)) return false;
      const ms = Date.parse(c.inicio);
      return !Number.isNaN(ms) && ms >= inicioMs && ms <= finMs;
    });
    const usadas = clasesUsadas(misReservas, clasesSemana);
    const limite =
      planClases?.limite_semanal ??
      actividadesAlumno.find(
        (a) => habilitadasSet.has(a.actividad as ActividadClase) && !a.pase_libre,
      )?.veces_por_semana ??
      null;
    return {
      tieneMembresiaClases,
      usadas:
        !planClases && actividadesAlumno.length === 0 && resumenClases
          ? resumenClases.usadas_semana
          : usadas,
      limite:
        !planClases && actividadesAlumno.length === 0 && resumenClases
          ? resumenClases.limite_semanal
          : limite,
    };
  }, [
    actividadesHabilitadas,
    contratacionesAlumno,
    actividadesAlumno,
    membresiaClases,
    planClases,
    ahoraClases,
    clases,
    misReservas,
    resumenClases,
  ]);

  const asistenciasClases = React.useMemo(() => {
    const base =
      resumenClases?.asistencias ??
      derivarAsistenciasLocal(misReservas, clases, feedbacksPorReserva, ahoraClases);
    return base.map((item) => ({
      ...item,
      sensacion: feedbacksPorReserva[item.reserva_id] ?? item.sensacion,
    }));
  }, [resumenClases, misReservas, clases, feedbacksPorReserva, ahoraClases]);

  const rachaClases = React.useMemo(() => {
    if (resumenClases) return resumenClases.racha_semanas;
    return calcularRachaSemanas(
      asistenciasClases.map((a) => a.inicio),
      ahoraClases,
    );
  }, [resumenClases, asistenciasClases, ahoraClases]);

  const rachaParaLogro = Math.max(rachaSemanas, rachaClases);
  React.useEffect(() => {
    if (rachaParaLogro >= 52) {
      void verificarYRegistrarLogroDiamante(rachaParaLogro, student?.id);
    }
  }, [rachaParaLogro, student?.id, verificarYRegistrarLogroDiamante]);

  const pendienteFeedback = React.useMemo(
    () => obtenerClasePendienteFeedback(asistenciasClases, ahoraClases),
    [asistenciasClases, ahoraClases],
  );

  const [guardandoFeedback, setGuardandoFeedback] = React.useState(false);

  const handleResponderFeedback = async (
    reservaId: string,
    sensacion: 1 | 2 | 3 | 4,
  ) => {
    if (guardandoFeedback) return;
    setGuardandoFeedback(true);
    try {
      const res = await responderFeedbackClase(reservaId, sensacion);
      if (!res.ok) {
        showToast(res.error || "No pudimos guardar tu devolución.", "warn");
      } else {
        showToast(
          res.queued
            ? "Devolución guardada. Se sincroniza al volver la señal."
            : "¡Gracias por tu devolución!",
          "ok",
        );
      }
    } finally {
      setGuardandoFeedback(false);
    }
  };

  const diaHero = diaActivoHoy || diasConEstado[0];
  const sesionIniciada = Boolean(
    diaHero &&
      currentSession.dia_id === diaHero.id &&
      currentSession.ejercicios.some((ej) => ej.series.some((s) => s.completada)),
  );

  const handleOpenOtherDay = (preselectedId?: string) => {
    if (sesionIniciada) {
      showToast("Terminá la sesión actual antes de cambiar de día.", "warn");
      return;
    }
    handleOpenSheet(preselectedId);
  };

  const handlePickDay = (dia: DiaConEstado) => {
    if (dia.estado === "DONE") {
      if (sesionIniciada && diaHero && dia.id !== diaHero.id) {
        showToast("Terminá la sesión actual antes de cambiar de día.", "warn");
        return;
      }
      empezarDia(dia.id);
      return;
    }
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

  const tarjetaClaseReservada = proximaClaseReservada ? (
    <section
      aria-label="Clase reservada"
      className="a-hero a-hero-notice"
      data-testid="clase-reservada-card"
    >
      <div className="a-hp">
        <span className="a-t-label a-eh">CLASE RESERVADA</span>
        <h2 className="a-t-d uppercase mt-[6px]">
          {proximaClaseReservada.actividadLabel}
        </h2>
        <small className="a-t-sec">{proximaClaseReservada.horarioLabel}</small>
        {proximaClaseReservada.clase.nota?.trim() && (
          <p className="a-t-sec mt-1.5" data-testid="clase-reservada-nota">
            {proximaClaseReservada.clase.nota.trim()}
          </p>
        )}
      </div>
    </section>
  ) : null;

  const tarjetaFeedbackPostClase = pendienteFeedback ? (
    <section
      aria-label="Feedback post-clase"
      className="a-card p-4 space-y-3 text-left"
      data-testid="feedback-post-clase-card"
    >
      <div className="space-y-0.5">
        <span className="a-t-label a-muted">
          {ACTIVIDAD_LABEL[pendienteFeedback.actividad] || pendienteFeedback.actividad} ·{" "}
          {formatearFechaClaseAsistencia(pendienteFeedback.inicio)}
        </span>
        <h2 className="a-t-title">¿Cómo te fue?</h2>
      </div>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        role="group"
        aria-label="Sensación de la clase"
      >
        {SENSACIONES_CLASE.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            disabled={guardandoFeedback}
            onClick={() => void handleResponderFeedback(pendienteFeedback.reserva_id, opcion.valor)}
            className="a-btn a-ghost min-h-11"
            data-testid={`feedback-opcion-${opcion.valor}`}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>
    </section>
  ) : null;

  const toastBanner = toastState ? (
    <div
      role="status"
      aria-live="polite"
      className={`a-toast ${toastState.variant === "warn" ? "a-warn" : "a-ok"} a-show justify-between max-w-[26rem] mx-auto`}
      style={toastState.canUndo ? { pointerEvents: "auto" } : undefined}
      data-testid={toastState.canUndo ? "toast-cambio-dia" : "toast-inicio"}
    >
      <div className="flex items-center gap-2.5 a-t-sec">
        <span className="a-tic">
          {toastState.variant === "warn" ? (
            <TriangleAlert width={16} height={16} className="a-i" />
          ) : (
            <Check width={16} height={16} className="a-i" />
          )}
        </span>
        <span>{toastState.message}</span>
      </div>
      {toastState.canUndo && (
        <button
          type="button"
          onClick={handleUndo}
          className="a-link min-h-[44px] px-2"
          data-testid="deshacer-cambio-dia-btn"
        >
          Deshacer
        </button>
      )}
    </div>
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

    if (resumenClasesInicio.tieneMembresiaClases) {
      const { usadas, limite } = resumenClasesInicio;
      return (
        <div className="a-view a-anim" data-testid="inicio-clases">
          <div className="a-hello" data-testid="inicio-clases-cabecera">
            <h1 className="a-hello-week uppercase">TUS CLASES</h1>
            {rachaClases >= 1 && (
              <IndicadorRachaSemanas semanas={rachaClases} diamantes={diamantesRacha} />
            )}
          </div>
          {bannerMensajeNoLeido}
          {tarjetaRecordatorioPeso}
          {tarjetaFeedbackPostClase}
          {tarjetaClaseReservada ?? (
            <section
              aria-label="Próxima clase"
              className="a-hero"
              data-testid="clases-reservar-cta-card"
            >
              <div className="a-hp">
                <span className="a-t-label a-eh">Tus clases</span>
                <h2 className="a-t-d mt-[6px]">Sin reserva próxima</h2>
                <small className="a-t-sec">
                  Elegí horario para entrenar esta semana
                </small>
              </div>
              <Link
                href="/athlete/clases"
                className="a-btn a-hbtn a-gym"
                data-testid="reservar-proxima-clase-cta"
              >
                <Calendar width={16} height={16} className="a-i" />
                <span>Reservá tu próxima clase</span>
              </Link>
            </section>
          )}
          <section className="a-card a-quota" data-testid="clases-semana-contador">
            {limite === null ? (
              <div className="flex items-baseline justify-between gap-2">
                <b className="a-t-bs">Pase libre</b>
                <span className="a-t-label a-muted">Esta semana</span>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <b className="a-t-bs">
                    {usadas} de {limite} clases esta semana
                  </b>
                </div>
                <div className="a-segbar" aria-hidden="true">
                  <span style={{ ["--n" as string]: 2 }}>
                    {Array.from({ length: Math.max(limite, 1) }, (_, i) => (
                      <i key={i} className={i < usadas ? "a-on" : ""} />
                    ))}
                  </span>
                </div>
              </>
            )}
          </section>
          {toastBanner}
        </div>
      );
    }

    return (
      <div className="a-view a-anim" data-testid="inicio-sin-plan">
        {bannerMensajeNoLeido}
        {tarjetaRecordatorioPeso}
        {tarjetaFeedbackPostClase}
        {tarjetaClaseReservada}
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
        {toastBanner}
      </div>
    );
  }

  return (
    <div className="a-view a-anim" data-testid="inicio-mis-dias-container">
      {/* Cabecera limpia de 1 fila: Semana del Plan + Racha SVG Flama Geométrica */}
      <div className="a-hello" data-testid="inicio-cabecera-hola">
        <h1 className="a-hello-week uppercase" data-testid="semana-plan-titulo">
          SEMANA {semanaPlan.actual}
        </h1>
        {rachaSemanas >= 1 && (
          <IndicadorRachaSemanas semanas={rachaSemanas} diamantes={diamantesRacha} />
        )}
      </div>

      {/* Aviso prominente de mensaje no leído del Coach */}
      {bannerMensajeNoLeido}

      {/* Tarjeta de instalación PWA (iPhone / Android) */}
      <InstalarAppCard />

      {/* Recordatorio Mensual de Peso Corporal (kg puro) (GOZS-345) */}
      {tarjetaRecordatorioPeso}

      {/* Feedback post-clase en 1 toque si asistió recientemente */}
      {tarjetaFeedbackPostClase}

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

      {/* Aviso de próxima clase reservada activa (sin acciones) */}
      {tarjetaClaseReservada}

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
      <p className="a-eb a-t-label">Tus días</p>

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
              className={`a-row ${isToday ? "a-today" : ""} ${isDone ? "a-done" : ""}`}
              aria-label={isDone ? `Día ${dia.orden}, hecho` : undefined}
              data-testid={`dia-row-${dia.id}`}
            >
              <span
                className="a-num"
                data-testid={isDone ? "dia-hecho-check" : undefined}
              >
                {isDone ? (
                  <Check width={16} height={16} className="a-i" />
                ) : (
                  dia.orden
                )}
              </span>
              <span className="a-rt">
                <b className={`a-t-bs ${isDone ? "a-muted" : ""}`}>
                  {etiquetaDia(dia)}
                </b>
                <small className={`a-t-sec ${isDone ? "a-muted" : ""}`}>
                  {subtitle}
                </small>
              </span>
              <ChevronRight width={18} height={18} className="a-i" />
            </button>
          );
        })}
      </section>

      {/* Sheet Inferior: ¿Qué día querés hacer hoy? */}
      {isSheetOpen && (
        <div
          className="a-sheet-wrap"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDaySheet();
          }}
          data-testid="sheet-backdrop"
        >
          <div
            ref={daySheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            className="a-sheet"
            data-testid="sheet-cambiar-dia"
          >
            <div className="a-sh-h">
              <div>
                <h2
                  id="sheet-title"
                  ref={daySheetTitleRef}
                  className="a-t-h"
                  tabIndex={-1}
                >
                  ¿Qué día querés hacer hoy?
                </h2>
                <p className="a-t-sec a-muted mt-1">
                  El Día {diaTeTocaHoy?.orden ?? 1} no se pierde: queda como el próximo.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDaySheet}
                className="a-icon-btn"
                aria-label="Cerrar selector de día"
              >
                <X width={20} height={20} className="a-i" />
              </button>
            </div>

            {/* Opciones de días */}
            <div className="a-qgroup" role="group" aria-label="Día">
              {diasConEstado.map((dia: DiaConEstado) => {
                const isDone = dia.estado === "DONE";
                const isSelected = sheetSelectedDiaId === dia.id;
                const isNaturalNext = dia.id === diaTeTocaHoy?.id;

                if (isDone) {
                  return (
                    <div
                      key={dia.id}
                      className="a-opt opacity-60 cursor-not-allowed"
                    >
                      <span className="a-ck">
                        <Check width={20} height={20} className="a-i" />
                      </span>
                      <b className="a-t-bs">{etiquetaDia(dia)}</b>
                      <small className="a-t-sec">Ya lo hiciste esta semana</small>
                    </div>
                  );
                }

                return (
                  <button
                    key={dia.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSheetSelectedDiaId(dia.id);
                      if (dia.id === diaTeTocaHoy?.id) {
                        setSheetMotivo(null);
                      }
                    }}
                    className="a-opt"
                    data-testid={`sheet-option-dia-${dia.id}`}
                  >
                    <span className="a-ck">
                      {isSelected ? <Check width={20} height={20} className="a-i" /> : null}
                    </span>
                    <b className="a-t-bs">{etiquetaDia(dia)}</b>
                    <small className="a-t-sec">
                      {isNaturalNext
                        ? "El que te tocaba"
                        : `${dia.ejerciciosCount} ejercicios · ~${dia.duracionMinutos} min`}
                    </small>
                  </button>
                );
              })}
            </div>

            {/* Sección ¿Por qué cambiás? (opcional) - visible cuando se cambia de día */}
            {Boolean(sheetSelectedDiaId && sheetSelectedDiaId !== diaTeTocaHoy?.id) && (
              <div className="space-y-2 pt-1" data-testid="seccion-motivo-cambio-dia">
                <label className="a-t-label a-muted block">
                  ¿Por qué cambiás? (opcional)
                </label>
                <div
                  className="a-chips"
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
                        className="h-11 rounded-full"
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
              className="a-btn a-gym"
              data-testid="confirmar-cambio-dia-btn"
            >
              Hacer Día {diasConEstado.find((d) => d.id === sheetSelectedDiaId)?.orden ?? 1} hoy
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastBanner}
    </div>
  );
}
