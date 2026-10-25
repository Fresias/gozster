"use client";

import * as React from "react";
import Link from "next/link";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { RetentionKpiCards } from "@/components/coach/retention-kpi-cards";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import { AssignPlanModal } from "@/components/coach/assign-plan-modal";
import { InviteStudentModal } from "@/components/coach/invite-student-modal";
import { Button } from "@/components/ui/button";
import { StudentCard } from "@/components/coach/student-card";
import { StudentDetail } from "@/components/coach/student-detail";
import { HistoricalLoadsDrawer } from "@/components/coach/historical-loads-drawer";
import { ChatFab } from "@/components/coach/chat-fab";
import {
  CriticalAlertsInbox,
  type CriticalAlert,
} from "@/components/coach/critical-alerts-inbox";
import { RoutineBuilderModal } from "@/components/coach/routine-builder/routine-builder-modal";
import { QuickSwapModal } from "@/components/coach/quick-swap-modal";
import { WhatsAppTemplateModal } from "@/components/coach/whatsapp-template-modal";
import { esAlumnoNuevo } from "@/lib/alumno-nuevo";
import { calculateStudentHealthScore } from "@/lib/strength-metrics";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { applyDemoEstados, useDemoAlertEstados } from "@/components/coach/critical-alerts-store";
import { getDemoCriticalAlerts } from "@/components/coach/critical-alerts-data";
import {
  DEMO_GIMNASIO,
  getDemoAlumnoAlerts,
} from "@/services/coach-demo-dataset";
import { WorkspaceModeToggle } from "@/components/ui/workspace-mode-toggle";

import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type { Perfil, PlanEntrenamiento } from "@/types/database.types";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import {
  REAL_ALUMNOS,
  REAL_PLANES,
  REAL_DIAS,
  REAL_EJERCICIOS,
  REAL_EJERCICIOS_RUTINA,
  REAL_HISTORIAL_CARGAS,
} from "@/services/real-mynter-data";

export function CoachStudioView({
  initialDataset,
  esAdmin = false,
}: {
  initialDataset?: LiveSupabaseDataset | null;
  esAdmin?: boolean;
} = {}) {
  const store = useCoachStudioStore();
  const { mode, setMode } = useWorkspaceModeStore();
  const isTestMode = mode === "TESTEO";
  // En Testeo, cualquiera que pase el middleware de /studio (ENTRENADOR o ADMIN) ve la franja.
  // En Producción solo el ADMIN: la RPC obtener_kpis_negocio rechaza a los demás roles.
  const showKpiStrip = isTestMode || esAdmin;
  const demoAlertEstados = useDemoAlertEstados((s) => s.estados);
  // "Sin alertas" = sin alertas pendientes (la bandeja y la ficha comparten estado)
  const hasPendingAlerts =
    isTestMode &&
    applyDemoEstados(getDemoCriticalAlerts(), demoAlertEstados).some(
      (a) => a.type === "DOLOR" && (a.estado || "PENDIENTE") === "PENDIENTE"
    );
  const leftCol = hasPendingAlerts ? "xl:col-start-1" : "xl:col-span-2";

  const liveAlumnos =
    initialDataset && initialDataset.alumnos.length > 0
      ? initialDataset.alumnos
      : store.alumnos;
  const livePlanes =
    initialDataset && initialDataset.planes.length > 0
      ? initialDataset.planes
      : store.planes;

  const alumnos = isTestMode ? DEMO_GIMNASIO.alumnos : liveAlumnos;
  const planes = isTestMode ? DEMO_GIMNASIO.planes : livePlanes;
  const dias =
    initialDataset && initialDataset.dias.length > 0
      ? initialDataset.dias
      : store.dias;
  const ejerciciosEnRutina =
    initialDataset && initialDataset.ejerciciosEnRutina.length > 0
      ? initialDataset.ejerciciosEnRutina
      : store.ejerciciosEnRutina;
  const ejercicios =
    initialDataset && initialDataset.ejercicios.length > 0
      ? initialDataset.ejercicios
      : store.ejercicios;

  const isLiveDatabase =
    !isTestMode &&
    (store.isLiveDatabase || Boolean(initialDataset && initialDataset.alumnos.length > 0));

  const {
    selectedAlumnoId,
    activeTab,
    isHistoricalLoadsOpen,
    isChatOpen,
    isRoutineBuilderOpen,
    toast,
    currentPage,
    itemsPerPage,
    selectAlumno,
    setActiveTab,
    setHistoricalLoadsOpen,
    setChatOpen,
    setRoutineBuilderOpen,
    setCurrentPage,
    dismissToast,
    clonarUltimaRutina,
    extenderVigenciaPlan,
    asignarPlanUrgente,
    obtenerMetricasRetencion,
    isLoading,
    loadLiveSupabaseData,
    getSelectedAlumno,
    getPlanesAlumnoCronologico,
    getRutinaActivaAlumno,
    getHistorialCargasAlumno,
    getContratacionAlumno,
    registrarRenovacionManual,
    extenderContratacionExcepcional,
    actualizarNivelVistaAlumno,
  } = store;

  const getHistorialCargas = (alumnoId: string): HistoricalLoadEntry[] =>
    isTestMode ? DEMO_GIMNASIO.historial[alumnoId] ?? [] : getHistorialCargasAlumno(alumnoId);

  React.useEffect(() => {
    if (initialDataset && initialDataset.alumnos.length > 0) {
      useCoachStudioStore.setState({
        alumnos: initialDataset.alumnos,
        planes: initialDataset.planes,
        dias: initialDataset.dias,
        ejerciciosEnRutina: initialDataset.ejerciciosEnRutina,
        ejercicios: initialDataset.ejercicios,
        isLiveDatabase: true,
      });
    } else {
      loadLiveSupabaseData();
    }
  }, [initialDataset, loadLiveSupabaseData]);

  const { isOnline, pendingEvents } = useOfflineQueueStore();
  const [isAlumnosExpanded, setIsAlumnosExpanded] = React.useState(false);
  React.useEffect(() => {
    setIsAlumnosExpanded(false);
  }, [isTestMode]);
  const showAlumnosBody = !isTestMode || isAlumnosExpanded;
  const [filterQuery, setFilterQuery] = React.useState("");
  const [paymentFilter, setPaymentFilter] = React.useState<
    "ALL" | "ACTIVA" | "PENDIENTE" | "SIN_PLAN" | "NUEVOS"
  >("ALL");
  // "Sin Plan" no existe en Testeo y "Nuevos" solo existe en Testeo: se deriva en render sin pisar el estado.
  const effectivePaymentFilter =
    (isTestMode && paymentFilter === "SIN_PLAN") || (!isTestMode && paymentFilter === "NUEVOS")
      ? "ALL"
      : paymentFilter;
  const [sinEntrenarFilter, setSinEntrenarFilter] = React.useState(false);
  // El filtro "Sin entrenar +7 días" solo existe en Testeo con la franja ADMIN visible: se deriva en render.
  const effectiveSinEntrenar = sinEntrenarFilter && isTestMode;
  const [viewMode, setViewMode] = React.useState<"table" | "cards">("table");
  const [tableDensity, setTableDensity] = React.useState<"compact" | "standard">("compact");
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = React.useState(false);
  const [localIsBuilderOpen, setLocalIsBuilderOpen] = React.useState(false);

  // Estados para Modales de Quick Swap y WhatsApp
  const [quickSwapData, setQuickSwapData] = React.useState<{
    isOpen: boolean;
    alumnoNombre: string;
    alumnoId: string;
    ejercicioActual: string;
    ejercicioActualId?: string;
    ejercicioEnRutinaId?: string;
    planId?: string;
    alertaId?: string;
    reporteDolorId?: string;
    dolorDetalle?: string;
    zona?: string;
  }>({
    isOpen: false,
    alumnoNombre: "",
    alumnoId: "",
    ejercicioActual: "",
  });

  const [whatsappData, setWhatsappData] = React.useState<{
    isOpen: boolean;
    alumnoNombre: string;
    phone?: string | null;
    exerciseName?: string;
  }>({
    isOpen: false,
    alumnoNombre: "",
  });

  const isBuilderModalVisible = isRoutineBuilderOpen || localIsBuilderOpen;
  const handleCloseBuilderModal = () => {
    setLocalIsBuilderOpen(false);
    setRoutineBuilderOpen(false);
  };

  const getInitials = (nombre: string) => {
    return nombre
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Retention metrics (calculadas en vivo o para dataset demo)
  const metricas = isTestMode
    ? {
        cantActivas: alumnos.filter(
          (a) => a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE",
        ).length,
        cantSinPlanEntrenamiento: alumnos.filter(
          (a) =>
            (a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE") &&
            !planes.some((p) => p.alumno_id === a.id && p.estado === "ACTIVO"),
        ).length,
        cantClientesPerdidosMes: alumnos.filter(
          (a) => a.estado_membresia === "INACTIVA",
        ).length,
      }
    : obtenerMetricasRetencion();

  // Students requiring routine
  const alumnosSinPlan = alumnos.filter((a) => {
    if (a.rol !== "ALUMNO") return false;
    const isActiva = a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE";
    if (!isActiva) return false;
    const planActivo = planes.find((p) => p.alumno_id === a.id && p.estado === "ACTIVO");
    return !planActivo;
  });

  // Filtering students
  const filteredAlumnos = alumnos.filter((a) => {
    const matchQuery =
      a.nombre_completo.toLowerCase().includes(filterQuery.toLowerCase()) ||
      (a.email?.toLowerCase().includes(filterQuery.toLowerCase()) ?? false);

    let matchPayment = true;
    if (effectivePaymentFilter === "ACTIVA") {
      matchPayment = a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE";
    } else if (effectivePaymentFilter === "PENDIENTE") {
      matchPayment = a.estado_membresia === "PENDIENTE";
    } else if (effectivePaymentFilter === "NUEVOS") {
      matchPayment = esAlumnoNuevo(a.created_at);
    } else if (effectivePaymentFilter === "SIN_PLAN") {
      const tienePlan = planes.some((p) => p.alumno_id === a.id && p.estado === "ACTIVO");
      matchPayment = !tienePlan;
    }

    const matchSinEntrenar = !effectiveSinEntrenar || DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids.includes(a.id);

    return matchQuery && matchPayment && matchSinEntrenar;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredAlumnos.length / itemsPerPage) || 1;
  const paginatedAlumnos = filteredAlumnos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const selectedAlumno = selectedAlumnoId
    ? alumnos.find((a) => a.id === selectedAlumnoId) ?? getSelectedAlumno()
    : null;
  const activePlan = selectedAlumno
    ? planes.find((p) => p.alumno_id === selectedAlumno.id && p.estado === "ACTIVO") ??
      getRutinaActivaAlumno(selectedAlumno.id)
    : null;
  const historialPlanes = selectedAlumno ? getPlanesAlumnoCronologico(selectedAlumno.id) : [];
  const historialCargas = selectedAlumno ? getHistorialCargas(selectedAlumno.id) : [];
  const contratacionAlumno = selectedAlumno
    ? getContratacionAlumno(selectedAlumno)
    : null;

  const handleAssignPlan = async (alumnoId: string) => {
    await asignarPlanUrgente(alumnoId);
  };

  // Handlers para abrir Quick Swap y WhatsApp
  const handleOpenQuickSwapFromAlert = (alert: CriticalAlert) => {
    const planActivo =
      planes.find((p) => p.alumno_id === alert.alumnoId && p.estado === "ACTIVO") ||
      planes.find((p) => p.alumno_id === alert.alumnoId);
    setQuickSwapData({
      isOpen: true,
      alumnoNombre: alert.alumnoNombre,
      alumnoId: alert.alumnoId,
      ejercicioActual: alert.ejercicioNombre,
      ejercicioActualId: alert.ejercicioId,
      ejercicioEnRutinaId: alert.ejercicioEnRutinaId,
      planId: planActivo?.id,
      alertaId: alert.id,
      reporteDolorId: alert.reporteDolorId,
      dolorDetalle: alert.detalle,
      zona: alert.zona,
    });
  };

  const handleOpenQuickSwapFromBadge = (
    alumno: Perfil,
    ejercicio: string,
    zona: string,
    detalle: string,
  ) => {
    const planActivo =
      planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ||
      planes.find((p) => p.alumno_id === alumno.id);
    setQuickSwapData({
      isOpen: true,
      alumnoNombre: alumno.nombre_completo,
      alumnoId: alumno.id,
      ejercicioActual: ejercicio,
      ejercicioActualId: undefined,
      ejercicioEnRutinaId: undefined,
      planId: planActivo?.id,
      dolorDetalle: detalle,
      zona,
    });
  };

  const handleOpenWhatsAppModal = (
    alumno: Perfil,
    exerciseName?: string,
  ) => {
    setWhatsappData({
      isOpen: true,
      alumnoNombre: alumno.nombre_completo,
      phone: alumno.telefono,
      exerciseName: exerciseName || "Press de Banca Plano",
    });
  };

  const handleSwapSuccess = (originalExercise: string, newExercise: string, motivo?: string) => {
    const store = useCoachStudioStore.getState();
    const planActivo =
      store.planes.find((p) => p.alumno_id === quickSwapData.alumnoId && p.estado === "ACTIVO") ||
      store.planes.find((p) => p.alumno_id === quickSwapData.alumnoId);
    const planId = quickSwapData.planId || planActivo?.id || "demo-plan-1";

    const ejOriginal = store.ejercicios.find(
      (e) => e.nombre.toLowerCase() === originalExercise.toLowerCase(),
    );
    const ejNuevo = store.ejercicios.find(
      (e) => e.nombre.toLowerCase() === newExercise.toLowerCase(),
    );

    store.registrarSustitucion({
      planId,
      ejercicioEnRutinaId: quickSwapData.ejercicioEnRutinaId,
      ejercicioOriginalId:
        quickSwapData.ejercicioActualId || ejOriginal?.id || "ej-orig-default",
      ejercicioSustitutoId: ejNuevo?.id || "ej-sust-default",
      originalNombre: originalExercise,
      nuevoNombre: newExercise,
      motivo: motivo || "Sustitución biomecánica por molestia informada",
      alertaId: quickSwapData.alertaId,
    });
  };

  // Helper para calcular alertas de dolor y records por atleta (para columna responsive)
  const getAlumnoAlerts = (
    alumno: Perfil,
    _planActivo: PlanEntrenamiento | null,
    _historial: HistoricalLoadEntry[],
  ) => {
    const badges: {
      type: "pain" | "pr";
      label: string;
      title: string;
      zona?: string;
      ejercicio?: string;
      detalle?: string;
    }[] = [];

    const nombreLower = alumno.nombre_completo.toLowerCase();

    if (nombreLower.includes("celeste")) {
      badges.push({
        type: "pain",
        label: "🚨 Rodilla",
        title: "Molestia articular en Rodilla - Tocar para Sustituir Ejercicio",
        zona: "Rodilla",
        ejercicio: "Sentadilla Trasera con Barra",
        detalle: "[Dolor: MODERADO] Rodilla - Pinchazo en fase concéntrica",
      });
    } else if (nombreLower.includes("lucas")) {
      // Lucas Giménez presenta múltiples alertas simultáneas (dolor + récord)
      badges.push({
        type: "pain",
        label: "🚨 Hombro",
        title: "Molestia articular en Hombro - Tocar para Sustituir Ejercicio",
        zona: "Hombro",
        ejercicio: "Press de Banca Plano",
        detalle: "[Dolor: LEVE] Hombro - Molestia anterior al descender la barra",
      });
      badges.push({
        type: "pr",
        label: "⚡ PR Banca",
        title: "Nuevo Récord Personal en Press de Banca - Tocar para felicitar por WhatsApp",
        ejercicio: "Press de Banca Plano",
      });
    } else if (nombreLower.includes("mateo")) {
      badges.push({
        type: "pr",
        label: "⚡ PR Sentadilla",
        title: "Nuevo Récord Personal en Sentadilla - Tocar para felicitar por WhatsApp",
        ejercicio: "Sentadilla Trasera",
      });
    }

    return badges;
  };

  return (
    <div className="relative w-full max-w-full overflow-x-hidden pb-28 sm:pb-32">
      {/* Toast feedback visual optimista */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 flex max-w-md items-start justify-between gap-3 rounded-xl border border-emerald-500/50 bg-card p-4 text-card-foreground shadow-2xl backdrop-blur"
        >
          <div>
            <h4 className="text-sm font-bold text-emerald-400">{toast.title}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Cerrar notificación"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* Offline Status Warning Bar */}
      {!isOnline && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <span>
              <strong>Modo Offline Activo:</strong> Las métricas y cambios se guardan localmente ({pendingEvents.length} eventos pendientes).
            </span>
          </div>
        </div>
      )}

      {/* Main view switcher */}
      {!selectedAlumno ? (
        <div className={isTestMode ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" : "space-y-6"}>
          {/* Header & Direct Link to Full Dashboard (Sin botón 'Constructor de Rutinas' aquí) */}
          <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${isTestMode ? leftCol : ""}`}>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Coach Studio
                </h1>
                {isTestMode ? (
                  <span
                    data-testid="badge-modo-testeo"
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/30"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    🧪 Modo Testeo ({alumnos.length} atletas demo)
                  </span>
                ) : isLiveDatabase ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Supabase Live ({alumnos.length} alumnos)
                  </span>
                ) : isLoading ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Sincronizando...
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Gestión operativa táctil de atletas, semáforos de salud M3 y supervisión activa.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <WorkspaceModeToggle />
              <Link
                href="/studio/dashboard"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity gap-2 shadow-xs active:scale-95"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <span>Vista Analíticas Completa →</span>
              </Link>
            </div>
          </div>

          {/* Banner de Modo Testeo Activo (Demo Conceptual) */}
          {isTestMode && (
            <div
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-foreground ${leftCol}`}
              data-testid="test-mode-banner"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 text-base shrink-0">
                  🧪
                </span>
                <div>
                  <p className="text-xs font-bold leading-tight flex items-center gap-2">
                    <span>MODO TESTEO ACTIVO</span>
                    <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                      10 Atletas Ficticios
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Exhibiendo todos los semáforos M3 (Cuota, Score Salud, Vigencia, Actividad) y alertas simultáneas para pruebas táctiles.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode("PRODUCCION")}
                  className="text-xs font-bold border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                  data-testid="btn-exit-test-mode"
                >
                  Volver a Producción ⚡
                </Button>
              </div>
            </div>
          )}

          {/* Bandeja de Alertas Críticas Compacta (Exclusiva Dolor Articular con Quick Swap) */}
          {isTestMode ? (
            hasPendingAlerts && (
              <aside className="relative self-stretch xl:col-start-2 xl:row-start-1 xl:row-span-3">
                <CriticalAlertsInbox
                  onSelectAlumno={(id) => selectAlumno(id)}
                  onQuickSwap={handleOpenQuickSwapFromAlert}
                />
              </aside>
            )
          ) : (
          <CriticalAlertsInbox
            onSelectAlumno={(id) => selectAlumno(id)}
            onQuickSwap={handleOpenQuickSwapFromAlert}
          />
          )}

          {/* Banner Ejecutivo Compacto de Alumnos Activos (Poda de Bloatware Churn/Sin Plan Gigantes) */}
          <div className={isTestMode ? leftCol : undefined}>
          {showKpiStrip ? (
            isTestMode ? (
              <BusinessKpiStrip
                kpis={DEMO_KPIS_NEGOCIO}
                sinEntrenarNombres={alumnos
                  .filter((a) => DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids.includes(a.id))
                  .map((a) => a.nombre_completo)}
                sinRutina={metricas.cantSinPlanEntrenamiento}
                onAsignarClick={() => setIsAssignModalOpen(true)}
                onSinEntrenarClick={() => {
                  setIsAlumnosExpanded(true);
                  setSinEntrenarFilter(true);
                  setCurrentPage(1);
                }}
              />
            ) : (
              // Producción: sin `kpis` fijo para que la franja llame a obtener_kpis_negocio.
              <BusinessKpiStrip
                alumnos={alumnos}
                sinRutina={metricas.cantSinPlanEntrenamiento}
                onAsignarClick={() => setIsAssignModalOpen(true)}
              />
            )
          ) : (
            <RetentionKpiCards
              metricas={metricas}
              onAssignPlanClick={() => setIsAssignModalOpen(true)}
            />
          )}
          </div>

          {/* Directorio de Atletas */}
          <div className={isTestMode ? "xl:col-span-2" : undefined}>
          <div
            className={
              isTestMode
                ? "rounded-2xl border border-border bg-card space-y-4 pb-4 [&>:not(button)]:mx-5"
                : "space-y-4"
            }
            data-testid="alumnos-directory"
          >
            {isTestMode && (
              <button
                type="button"
                onClick={() => setIsAlumnosExpanded(!isAlumnosExpanded)}
                aria-expanded={isAlumnosExpanded}
                className="w-full min-h-14 px-5 flex items-center justify-between"
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-sm font-bold text-foreground">Alumnos</span>
                  <span className="rounded-full bg-secondary px-2 text-xs tabular-nums">
                    {alumnos.length}
                  </span>
                </span>
                <span aria-hidden="true" className="text-xs text-muted-foreground">
                  {isAlumnosExpanded ? "▲" : "▼"}
                </span>
              </button>
            )}
            {showAlumnosBody && (<>
            {/* Search, Filters, Tools and View Toggle */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="w-full sm:max-w-xs">
                <input
                  type="search"
                  value={filterQuery}
                  onChange={(e) => {
                    setFilterQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={isTestMode ? "Buscar atleta…" : "Buscar atleta o email..."}
                  className="min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Filtro:</span>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentFilter("ALL");
                    setCurrentPage(1);
                  }}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
                    effectivePaymentFilter === "ALL"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  Todos ({alumnos.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentFilter("ACTIVA");
                    setCurrentPage(1);
                  }}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
                    effectivePaymentFilter === "ACTIVA"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  Al día ({alumnos.filter((a) => a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE").length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentFilter("PENDIENTE");
                    setCurrentPage(1);
                  }}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
                    effectivePaymentFilter === "PENDIENTE"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  Pago pendiente ({alumnos.filter((a) => a.estado_membresia === "PENDIENTE").length})
                </button>
                {isTestMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentFilter("NUEVOS");
                      setCurrentPage(1);
                    }}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
                      effectivePaymentFilter === "NUEVOS"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Nuevos ({alumnos.filter((a) => esAlumnoNuevo(a.created_at)).length})
                  </button>
                )}
                {!isTestMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentFilter("SIN_PLAN");
                      setCurrentPage(1);
                    }}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
                      effectivePaymentFilter === "SIN_PLAN"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Sin Plan ({metricas.cantSinPlanEntrenamiento})
                  </button>
                )}

                {effectiveSinEntrenar && (
                  <button
                    type="button"
                    onClick={() => {
                      setSinEntrenarFilter(false);
                      setCurrentPage(1);
                    }}
                    data-testid="chip-sin-entrenar"
                    className="min-h-9 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary"
                  >
                    Sin entrenar +7 días ✕
                  </button>
                )}

                {/* Botón de Herramientas: Constructor de Rutinas (Movido desde cabecera principal) */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocalIsBuilderOpen(true)}
                  className="min-h-9 text-xs font-bold border-primary/40 text-primary hover:bg-primary/10 gap-1.5 rounded-lg"
                  data-testid="open-routine-builder-btn"
                  title="Abrir Constructor Visual de Rutinas"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  <span>Constructor</span>
                </Button>

                {/* Alta directa de alumno (Edge Function alta-alumno-directa) con credenciales al instante */}
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsInviteModalOpen(true)}
                  className="min-h-9 gap-1.5 rounded-lg text-xs font-bold"
                  data-testid="open-invite-student-btn"
                  title="Dar de alta a un nuevo alumno al instante"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                  <span>Alta de alumno</span>
                </Button>

                {/* Selector de Modo de Visualización (INDEC vs Tarjetas); oculto en Modo Testeo */}
                {!isTestMode && (
                <div className="flex items-center rounded-xl bg-secondary/80 border border-border/60 p-0.5 text-xs font-medium ml-auto">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "table"
                        ? "bg-card text-primary shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Cuadro INDEC
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "cards"
                        ? "bg-card text-primary shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Tarjetas
                  </button>
                </div>
                )}
              </div>
            </div>

            {/* Contenido según vista seleccionada */}
            {isTestMode || viewMode === "table" ? (
              /* Cuadro Estadístico INDEC 1.1 con Semáforos M3 Puros y Ergonomía Táctil (Touch targets ≥ 48px) */
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
                {/* Subheader & Metadatos INDEC */}
                <div className="border-b border-border/80 bg-secondary/30 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    {!isTestMode && (
                      <span className="text-xs font-black text-foreground">Cuadro 1.1</span>
                    )}
                    {!isTestMode && (
                      <span className="text-xs text-muted-foreground">
                        — Matriz Operativa Semáforos M3: Estado Cuota, Score Salud, Vigencia y Alertas
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border/60 text-muted-foreground font-medium hidden md:inline">
                      Semana 42 / Octubre 2026
                    </span>
                  </div>

                  {!isTestMode && (<div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg bg-secondary/80 border border-border/60 p-0.5 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setTableDensity("compact")}
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                          tableDensity === "compact"
                            ? "bg-card text-primary shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Compacto (34px)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTableDensity("standard")}
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                          tableDensity === "standard"
                            ? "bg-card text-primary shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Estándar (48px)
                      </button>
                    </div>
                  </div>)}
                </div>

                {/* Tabla Matriz con Semáforos M3 (Cero Texto Redundante) */}
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-secondary/40 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        <th className="py-2.5 px-3 text-left w-60 sticky left-0 bg-card z-10 border-r border-border/40">
                          Atleta (Columna Matriz)
                        </th>
                        <th className="py-2.5 px-3 text-center w-24">Cuota</th>
                        <th className="py-2.5 px-3 text-center w-24">Score Salud [SH]</th>
                        <th className="py-2.5 px-3 text-center w-28">Vigencia Rutina</th>
                        <th className="py-2.5 px-3 text-center w-24">Actividad</th>
                        <th className="py-2.5 px-3 text-left min-w-[130px] max-w-[190px]">Alertas</th>
                        <th className="py-2.5 px-3 text-center w-40">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-foreground">
                      {paginatedAlumnos.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-muted-foreground">
                            No se encontraron atletas con los criterios seleccionados.
                          </td>
                        </tr>
                      ) : (
                        paginatedAlumnos.map((alumno) => {
                          const planActivo = isTestMode
                            ? planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ?? null
                            : getRutinaActivaAlumno(alumno.id);
                          const historial = getHistorialCargas(alumno.id);

                          // Cálculo de Cuota (Semáforo M3 Puro: 🟢 Verde, 🟡 Amarillo, 🔴 Rojo)
                          let isAlDia =
                            alumno.estado_membresia === "ACTIVA" ||
                            alumno.estado_membresia === "ACTIVE";
                          let isPendiente = alumno.estado_membresia === "PENDIENTE";
                          let cuotaTooltip = isAlDia
                            ? "Cuota al día"
                            : isPendiente
                            ? "Vence en ≤ 3 días (Pago Pendiente)"
                            : "Cuota vencida / Inactiva";

                          if (alumno.fecha_vencimiento_cuota) {
                            const vencimiento = new Date(alumno.fecha_vencimiento_cuota);
                            const diffDays = Math.ceil(
                              (vencimiento.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                            );
                            if (diffDays > 3) {
                              isAlDia = true;
                              isPendiente = false;
                              cuotaTooltip = `Cuota al día (vence en ${diffDays} días)`;
                            } else if (diffDays >= 0) {
                              isAlDia = false;
                              isPendiente = true;
                              cuotaTooltip =
                                diffDays === 0
                                  ? "Vence hoy (Pago Pendiente)"
                                  : `Vence en ${diffDays} día${diffDays > 1 ? "s" : ""} (Pago Pendiente)`;
                            } else {
                              isAlDia = false;
                              isPendiente = false;
                              cuotaTooltip = `Cuota vencida hace ${Math.abs(diffDays)} días`;
                            }
                          }

                          const cuotaDotColor = isAlDia
                            ? "bg-emerald-500 border border-emerald-600/30"
                            : isPendiente
                            ? "bg-amber-500 border border-amber-600/30"
                            : "bg-rose-500 border border-rose-600/30";

                          // Cálculo Score Salud [SH] (Micro-badge numérico tonal compacto: [ 88 ])
                          let shScore: number;
                          if (isTestMode) {
                            const nl = alumno.nombre_completo.toLowerCase();
                            if (nl.includes("mateo")) shScore = 96;
                            else if (nl.includes("esteban")) shScore = 91;
                            else if (nl.includes("lucas")) shScore = 88;
                            else if (nl.includes("valentina")) shScore = 82;
                            else if (nl.includes("celeste")) shScore = 76;
                            else if (nl.includes("camila")) shScore = 71;
                            else if (nl.includes("facundo")) shScore = 64;
                            else if (nl.includes("martina")) shScore = 58;
                            else if (nl.includes("sofia")) shScore = 48;
                            else if (nl.includes("bautista")) shScore = 35;
                            else shScore = 80;
                          } else {
                            const cuotaScore = isAlDia ? 100 : isPendiente ? 50 : 15;
                            const planScore = planActivo ? 90 : 35;
                            shScore = Math.round(
                              calculateStudentHealthScore({
                                adherencia: planScore,
                                frecuencia: planActivo ? 85 : 40,
                                interaccionChat: 75,
                                estadoCuota: cuotaScore,
                              }).score,
                            );
                          }

                          const healthScore = { score: shScore };

                          const shColorClass =
                            healthScore.score >= 80
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : healthScore.score >= 60
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                              : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";

                          // Cálculo Vigencia de Rutina (Micro-barra / pill sin nombre de archivo)
                          // 🟢 < 30 días, 🟡 30-60 días, 🔴 > 60 días o sin plan
                          let rutinaPillColor = "bg-rose-500";
                          let rutinaTooltip = "Sin plan asignado (> 60 días)";

                          if (planActivo) {
                            const planDate = new Date(
                              planActivo.fecha_inicio || planActivo.created_at,
                            ).getTime();
                            const diffDays = Math.floor(
                              (Date.now() - planDate) / (1000 * 60 * 60 * 24),
                            );

                            if (diffDays < 30) {
                              rutinaPillColor = "bg-emerald-500";
                              rutinaTooltip = `Rutina vigente (< 30 días)`;
                            } else if (diffDays <= 60) {
                              rutinaPillColor = "bg-amber-500";
                              rutinaTooltip = `Rutina por renovar (30-60 días)`;
                            } else {
                              rutinaPillColor = "bg-rose-500";
                              rutinaTooltip = `Rutina vencida (> 60 días)`;
                            }
                          }

                          // Cálculo Actividad / Recencia (Dot de último entreno/login)
                          // 🟢 < 7 días, 🟡 7-14 días, 🔴 > 14 días
                          let recenciaDotColor = "bg-rose-500";
                          let recenciaTooltip = "Inactivo (> 14 días)";

                          if (alumno.ultimo_entreno_at) {
                            const diffDays = Math.floor(
                              (Date.now() - new Date(alumno.ultimo_entreno_at).getTime()) /
                                (1000 * 60 * 60 * 24),
                            );
                            if (diffDays < 7) {
                              recenciaDotColor = "bg-emerald-500";
                              recenciaTooltip =
                                diffDays === 0
                                  ? "Último entreno: hoy (< 7 días)"
                                  : `Último entreno: < 7 días (${diffDays}d)`;
                            } else if (diffDays <= 14) {
                              recenciaDotColor = "bg-amber-500";
                              recenciaTooltip = `Último entreno: 7-14 días (${diffDays}d)`;
                            } else {
                              recenciaDotColor = "bg-rose-500";
                              recenciaTooltip = `Inactivo (> 14 días, ${diffDays}d)`;
                            }
                          } else if (planActivo) {
                            if (historial.length > 0) {
                              recenciaDotColor = "bg-emerald-500";
                              recenciaTooltip = "Último entreno: < 7 días";
                            } else if (alumno.nombre_completo.toLowerCase().includes("sofia")) {
                              recenciaDotColor = "bg-amber-500";
                              recenciaTooltip = "Último entreno: 7-14 días";
                            } else {
                              recenciaDotColor = "bg-emerald-500";
                              recenciaTooltip = "Último entreno: < 7 días";
                            }
                          }

                          // Badges de alerta por atleta
                          const badges = isTestMode
                            ? getDemoAlumnoAlerts(alumno.nombre_completo)
                            : getAlumnoAlerts(alumno, planActivo, historial);

                          const isCompact = !isTestMode && tableDensity === "compact";
                          // Clases de altura de fila que preservan la referencia de 34px y acomodan ergonomía táctil
                          const rowPaddingClass = isCompact
                            ? "min-h-[34px] py-1.5"
                            : "min-h-[48px] py-2.5";

                          return (
                            <tr
                              key={alumno.id}
                              className="hover:bg-muted/40 transition-colors group"
                            >
                              {/* 1. Columna Matriz Fija */}
                              <td
                                className={`${rowPaddingClass} px-3 sticky left-0 bg-card z-10 border-r border-border/40 group-hover:bg-card`}
                              >
                                <button
                                  type="button"
                                  onClick={() => selectAlumno(alumno.id)}
                                  className="flex items-center gap-2.5 text-left w-full hover:text-primary transition-colors"
                                >
                                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                                    {getInitials(alumno.nombre_completo)}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-bold text-foreground block truncate leading-tight text-xs">
                                      {alumno.nombre_completo}
                                      {isTestMode && esAlumnoNuevo(alumno.created_at) && (
                                        <span className="ml-1.5 align-middle text-[10px] rounded bg-secondary px-1.5 font-normal text-muted-foreground">
                                          Nuevo
                                        </span>
                                      )}
                                    </span>
                                    {!isTestMode && (
                                      <span className="text-[10px] text-muted-foreground block truncate">
                                        {alumno.email ?? "—"}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              </td>

                              {/* 2. Cuota (Semáforo M3 Puro: Círculo 10-12px sin texto redundante) */}
                              <td className={`${rowPaddingClass} px-3 text-center`}>
                                <div className="flex items-center justify-center">
                                  <span
                                    className={`inline-block h-3 w-3 rounded-full ${cuotaDotColor}`}
                                    title={cuotaTooltip}
                                    aria-label={cuotaTooltip}
                                    role="status"
                                  />
                                </div>
                              </td>

                              {/* 3. Score Salud [SH] (Micro-badge numérico tonal compacto: [ 88 ]) */}
                              <td
                                className={`${rowPaddingClass} px-3 text-center font-mono font-bold tabular-nums`}
                              >
                                <div className="flex items-center justify-center">
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold border ${shColorClass}`}
                                    title={`Score Salud: ${Math.round(healthScore.score)} / 100`}
                                  >
                                    [ {Math.round(healthScore.score)} ]
                                  </span>
                                </div>
                              </td>

                              {/* 4. Vigencia de Rutina (Micro-barra o pill sin nombre de archivo, cero texto) */}
                              <td className={`${rowPaddingClass} px-3 text-center`}>
                                <div className="flex items-center justify-center">
                                  <span
                                    className={`inline-block h-2.5 w-10 rounded-full ${rutinaPillColor}`}
                                    title={rutinaTooltip}
                                    aria-label={rutinaTooltip}
                                    role="status"
                                  />
                                </div>
                              </td>

                              {/* 5. Actividad / Recencia (Dot de último entreno/login, cero texto) */}
                              <td className={`${rowPaddingClass} px-3 text-center`}>
                                <div className="flex items-center justify-center">
                                  <span
                                    className={`inline-block h-3 w-3 rounded-full ${recenciaDotColor}`}
                                    title={recenciaTooltip}
                                    aria-label={recenciaTooltip}
                                    role="status"
                                  />
                                </div>
                              </td>

                              {/* 6. Columna de Alertas Responsive (min-w-[130px] max-w-[190px] sin desbordamiento) */}
                              <td className={`${rowPaddingClass} px-3 text-left`}>
                                <div className="flex flex-wrap gap-1.5 min-w-[130px] max-w-[190px]">
                                  {badges.length === 0 ? (
                                    <span className="text-muted-foreground/40 text-[11px] select-none">
                                      —
                                    </span>
                                  ) : (
                                    badges.map((badge, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => {
                                          if (badge.type === "pain") {
                                            handleOpenQuickSwapFromBadge(
                                              alumno,
                                              badge.ejercicio || "Ejercicio",
                                              badge.zona || "Articular",
                                              badge.detalle || "",
                                            );
                                          } else {
                                            handleOpenWhatsAppModal(alumno, badge.ejercicio);
                                          }
                                        }}
                                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border transition-colors cursor-pointer active:scale-95 ${
                                          badge.type === "pain"
                                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/25"
                                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                                        }`}
                                        title={badge.title}
                                        aria-label={badge.title}
                                      >
                                        {badge.label}
                                      </button>
                                    ))
                                  )}
                                </div>
                              </td>

                              {/* 7. Acciones Táctiles "Fat-Finger Friendly" (Touch targets de 48 × 48 px y separación ≥ 8px) */}
                              <td className={`${rowPaddingClass} px-3 text-center`}>
                                <div className="flex items-center justify-center gap-2">
                                  {/* Botón WhatsApp directo con integración wa.me y templates argentinos */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenWhatsAppModal(alumno)}
                                    className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 active:scale-95 transition-all shadow-xs"
                                    title="Enviar WhatsApp (Templates Argentinos)"
                                    aria-label={`Enviar WhatsApp a ${alumno.nombre_completo}`}
                                    data-testid={`btn-whatsapp-${alumno.id}`}
                                  >
                                    <svg
                                      className="h-5 w-5"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden="true"
                                    >
                                      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.299.144.347.491 1.2.534 1.287.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.086-.177.18-.076.353.101.173.449.741.964 1.2 1.034.922 1.353.948 1.545 1.043.193.095.304.08.417-.052.113-.131.484-.564.613-.757.13-.193.26-.162.434-.097.173.065 1.098.518 1.286.612.188.094.314.141.361.22.047.079.047.463-.097.868z" />
                                    </svg>
                                  </button>

                                  {/* Botón Ver Ficha / Detalle */}
                                  <button
                                    type="button"
                                    onClick={() => selectAlumno(alumno.id)}
                                    className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border/60 active:scale-95 transition-all shadow-xs"
                                    title="Ver Ficha y Rutinas del Atleta"
                                    aria-label={`Ver ficha de ${alumno.nombre_completo}`}
                                    data-testid={`btn-ver-ficha-${alumno.id}`}
                                  >
                                    <svg
                                      className="h-5 w-5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      aria-hidden="true"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                      />
                                    </svg>
                                  </button>

                                  {/* Si no tiene plan: Asignar Plan Urgente */}
                                  {!planActivo && (
                                    <button
                                      type="button"
                                      onClick={() => handleAssignPlan(alumno.id)}
                                      className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold active:scale-95 transition-all shadow-xs"
                                      title="Asignar Plan Urgente en 1-Clic"
                                      aria-label={`Asignar plan urgente a ${alumno.nombre_completo}`}
                                      data-testid={`btn-asignar-plan-${alumno.id}`}
                                    >
                                      <svg
                                        className="h-5 w-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        aria-hidden="true"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M13 10V3L4 14h7v7l9-11h-7z"
                                        />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer INDEC */}
                <div className="bg-secondary/40 border-t border-border/80 px-4 py-2 text-[11px] text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                  <span>
                    Nota: Semáforos Material Design 3 con codificación tonal sin texto redundante. Touch targets ≥ 48px según estándar ergonómico.
                  </span>
                  <span className="font-semibold text-foreground">
                    Fuente: GOZSter Studio / {isTestMode ? "Modo Testeo (Dataset demo)" : "Registro Supabase Live"}
                  </span>
                </div>
              </div>
            ) : (
              /* Student Cards Layout (<768px ergonomic card layout) */
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {paginatedAlumnos.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No se encontraron alumnos con los criterios seleccionados.
                  </div>
                ) : (
                  paginatedAlumnos.map((alumno) => {
                    const planActivo = isTestMode
                      ? planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ?? null
                      : getRutinaActivaAlumno(alumno.id);
                    return (
                      <StudentCard
                        key={alumno.id}
                        alumno={alumno}
                        rutinaActiva={planActivo}
                        onSelect={(id) => selectAlumno(id)}
                      />
                    );
                  })
                )}
              </div>
            )}

            {/* Pagination Controls */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border/80 pt-4 pr-16 sm:pr-0">
              <span className="text-xs text-muted-foreground">
                Mostrando {paginatedAlumnos.length} de {filteredAlumnos.length} atletas
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className="min-h-11 text-xs px-4 rounded-xl"
                >
                  ← Anterior
                </Button>
                <span className="px-2 text-xs font-medium text-foreground">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  className="min-h-11 text-xs px-4 rounded-xl"
                >
                  Siguiente →
                </Button>
              </div>
            </div>
            </>)}
          </div>
          </div>
        </div>
      ) : (
        /* Ficha del Alumno View */
        <StudentDetail
          alumno={selectedAlumno}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onBack={() => selectAlumno(null)}
          rutinaActiva={activePlan}
          historialPlanes={historialPlanes}
          dias={dias}
          ejerciciosEnRutina={ejerciciosEnRutina}
          ejerciciosCatalogo={ejercicios}
          onOpenHistoricalLoads={() => setHistoricalLoadsOpen(true)}
          onClonarUltimaRutina={clonarUltimaRutina}
          onExtenderVigencia={extenderVigenciaPlan}
          isOffline={!isOnline}
          contratacion={contratacionAlumno}
          onRegistrarRenovacion={registrarRenovacionManual}
          onExtenderExcepcional={extenderContratacionExcepcional}
          onOpenChat={() => setChatOpen(true)}
          onActualizarNivelVista={actualizarNivelVistaAlumno}
          onQuickSwap={handleOpenQuickSwapFromAlert}
        />
      )}

      {/* Modal de Sustitución Rápida ante Dolor (Quick Swap) */}
      <QuickSwapModal
        isOpen={quickSwapData.isOpen}
        onClose={() => setQuickSwapData((prev) => ({ ...prev, isOpen: false }))}
        alumnoNombre={quickSwapData.alumnoNombre}
        alumnoId={quickSwapData.alumnoId}
        ejercicioActual={quickSwapData.ejercicioActual}
        ejercicioActualId={quickSwapData.ejercicioActualId}
        ejercicioEnRutinaId={quickSwapData.ejercicioEnRutinaId}
        planId={quickSwapData.planId}
        alertaId={quickSwapData.alertaId}
        reporteDolorId={quickSwapData.reporteDolorId}
        dolorDetalle={quickSwapData.dolorDetalle}
        zona={quickSwapData.zona}
        catalogoEjercicios={ejercicios}
        onSwapSuccess={handleSwapSuccess}
      />

      {/* Modal de Templates WhatsApp en Tono Argentino (Fat-Finger Friendly) */}
      <WhatsAppTemplateModal
        isOpen={whatsappData.isOpen}
        onClose={() => setWhatsappData((prev) => ({ ...prev, isOpen: false }))}
        alumnoNombre={whatsappData.alumnoNombre}
        phone={whatsappData.phone}
        exerciseName={whatsappData.exerciseName}
      />

      {/* Modal de Asignación Urgente de Rutinas */}
      <AssignPlanModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        alumnosSinPlan={alumnosSinPlan}
        onAssignPlan={handleAssignPlan}
        onSelectAlumno={(id) => selectAlumno(id)}
      />

      {/* Modal "Alta de alumno": alta directa + tarjeta de contingencia + recarga de alumnos */}
      <InviteStudentModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvited={() => loadLiveSupabaseData()}
      />

      {/* Constructor Visual de Rutinas Drag & Drop + Superseries */}
      <RoutineBuilderModal
        isOpen={isBuilderModalVisible}
        onClose={handleCloseBuilderModal}
        catalogoEjercicios={ejercicios}
        alumnoId={selectedAlumnoId || undefined}
        alumnoNombre={selectedAlumno?.nombre_completo || "Plantilla Maestra"}
        onRoutineSaved={() => loadLiveSupabaseData()}
      />

      {/* Lateral Panel / Modal: Historical Loads & RPE */}
      <HistoricalLoadsDrawer
        isOpen={isHistoricalLoadsOpen}
        onClose={() => setHistoricalLoadsOpen(false)}
        alumno={selectedAlumno}
        historial={historialCargas}
      />

      {/* Floating Action Button (FAB) of Chat */}
      <ChatFab
        alumno={selectedAlumno}
        isOpen={isChatOpen}
        onToggle={() => setChatOpen(!isChatOpen)}
      />
    </div>
  );
}
