"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import { AssignPlanModal } from "@/components/coach/assign-plan-modal";
import { AssignRoutinePreviewModal } from "@/components/coach/assign-routine-preview-modal";
import { AthletePreviewModal } from "@/components/coach/athlete-preview-modal";
import { InviteStudentModal } from "@/components/coach/invite-student-modal";
import { Button } from "@/components/ui/button";
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
import { StudioSankeyModal } from "@/components/coach/studio-sankey-modal";
import { esAlumnoNuevo } from "@/lib/alumno-nuevo";
import { getRutinaVigenciaInfo } from "@/lib/rutina-vigencia";
import { applyDemoEstados, useDemoAlertEstados } from "@/components/coach/critical-alerts-store";
import { getDemoCriticalAlerts } from "@/components/coach/critical-alerts-data";
import {
  DEMO_GIMNASIO,
  DEMO_ALUMNO_ACTIVIDADES,
  DEMO_CONTRATACIONES_CLASES,
  getDemoAlumnoAlerts,
} from "@/services/coach-demo-dataset";
import {
  ETIQUETAS_FILTRO_ACTIVIDAD,
  ETIQUETAS_ACTIVIDAD,
  alumnoTieneActividad,
  obtenerActividadesAlumno,
} from "@/lib/alumno-actividades";
import { useCobrosStore } from "@/store/use-cobros-store";
import { derivarBadgePlan } from "@/lib/planes";

import type { LiveSupabaseDataset, AlumnoEstancado } from "@/services/alumnos-service";
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
  estancados = [],
  initialAlumnosExpanded = false,
}: {
  initialDataset?: LiveSupabaseDataset | null;
  estancados?: AlumnoEstancado[];
  initialAlumnosExpanded?: boolean;
} = {}) {
  const store = useCoachStudioStore();
  const demoAlertEstados = useDemoAlertEstados((s) => s.estados);
  // "Sin alertas" = sin alertas pendientes (la bandeja y la ficha comparten estado)
  const hasPendingAlerts =
    applyDemoEstados(getDemoCriticalAlerts(), demoAlertEstados).some(
      (a) => a.type === "DOLOR" && (a.estado || "PENDIENTE") === "PENDIENTE"
    );
  const leftCol = hasPendingAlerts ? "xl:col-start-1" : "xl:col-span-2";

  const alumnos = DEMO_GIMNASIO.alumnos;

  // Mapa de alumnos estancados (+30 días sin PR) (GOZS-351)
  const estancadosMap = React.useMemo(() => {
    const map = new Map<string, AlumnoEstancado>();
    for (const e of estancados) {
      map.set(e.alumnoId, e);
    }
    if (estancados.length === 0) {
      const demoEstancado = alumnos.find(
        (a) =>
          a.nombre_completo.toLowerCase().includes("sofia") ||
          a.nombre_completo.toLowerCase().includes("albarracín"),
      );
      if (demoEstancado) {
        map.set(demoEstancado.id, { alumnoId: demoEstancado.id, diasSinPR: 42 });
      }
    }
    return map;
  }, [estancados, alumnos]);
  const planes = DEMO_GIMNASIO.planes;
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

  const {
    selectedAlumnoId,
    chatAlumnoId,
    activeTab,
    isHistoricalLoadsOpen,
    isChatOpen,
    isWhatsAppEnabled,
    isRoutineBuilderOpen,
    toast,
    currentPage,
    itemsPerPage,
    selectAlumno,
    openChatForAlumno,
    setWhatsAppEnabled,
    setActiveTab,
    setHistoricalLoadsOpen,
    setChatOpen,
    setRoutineBuilderOpen,
    setCurrentPage,
    dismissToast,
    clonarUltimaRutina,
    extenderVigenciaPlan,
    asignarPlanUrgente,
    asignarPlanDesdePlantilla,
    isLoading,
    loadLiveSupabaseData,
    getSelectedAlumno,
    getPlanesAlumnoCronologico,
    getRutinaActivaAlumno,
    getContratacionAlumno,
    registrarRenovacionManual,
    extenderContratacionExcepcional,
    actualizarNivelVistaAlumno,
  } = store;

  const getHistorialCargas = (alumnoId: string): HistoricalLoadEntry[] =>
    DEMO_GIMNASIO.historial[alumnoId] ?? [];

  React.useEffect(() => {
    if (initialDataset && initialDataset.alumnos.length > 0) {
      const timer = setTimeout(() => {
        useCoachStudioStore.setState({
          alumnos: initialDataset.alumnos,
          planes: initialDataset.planes,
          dias: initialDataset.dias,
          ejerciciosEnRutina: initialDataset.ejerciciosEnRutina,
          ejercicios: initialDataset.ejercicios,
          isLiveDatabase: true,
        });
      }, 0);
      return () => clearTimeout(timer);
    } else {
      loadLiveSupabaseData();
    }
  }, [initialDataset, loadLiveSupabaseData]);

  const { isOnline, pendingEvents } = useOfflineQueueStore();
  const [isAlumnosExpanded, setIsAlumnosExpanded] = React.useState(initialAlumnosExpanded);
  const showAlumnosBody = isAlumnosExpanded;
  const [filterQuery, setFilterQuery] = React.useState("");
  const [paymentFilter, setPaymentFilter] = React.useState<
    "ALL" | "ACTIVA" | "PENDIENTE" | "NUEVOS"
  >("ALL");
  const router = useRouter();
  const [sinEntrenarFilter, setSinEntrenarFilter] = React.useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [isSankeyModalOpen, setIsSankeyModalOpen] = React.useState(false);
  const filtroActividad = store.filtroActividad ?? "TODAS";
  const setFiltroActividad = store.setFiltroActividad;
  const [assignRoutineTarget, setAssignRoutineTarget] = React.useState<Perfil | null>(null);
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

  const [previewAlumno, setPreviewAlumno] = React.useState<Perfil | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const previewParam = params.get("preview") || params.get("previewAlumno") || params.get("impersonate");
    if (previewParam) {
      const q = previewParam.toLowerCase();
      const found = alumnos.find((a) => a.id === previewParam || a.nombre_completo.toLowerCase().includes(q));
      if (found) {
        setPreviewAlumno(found);
      }
    }
  }, [alumnos]);

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
  const metricas = {
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
      };

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
    const planActivo =
      planes.find((p) => p.alumno_id === a.id && p.estado === "ACTIVO") ??
      getRutinaActivaAlumno(a.id);
    const nombrePlan = (planActivo as { nombre?: string; nombre_rutina?: string } | null)?.nombre ??
      (planActivo as { nombre?: string; nombre_rutina?: string } | null)?.nombre_rutina;
    const matchQuery =
      !filterQuery ||
      a.nombre_completo.toLowerCase().includes(filterQuery.toLowerCase()) ||
      (a.email?.toLowerCase().includes(filterQuery.toLowerCase()) ?? false) ||
      (nombrePlan?.toLowerCase().includes(filterQuery.toLowerCase()) ?? false) ||
      (filterQuery.toLowerCase().trim() === "gabi" && a.nombre_completo.toLowerCase().includes("gabriel"));

    let matchPayment = true;
    if (paymentFilter === "ACTIVA") {
      matchPayment = a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE";
    } else if (paymentFilter === "PENDIENTE") {
      matchPayment = a.estado_membresia === "PENDIENTE";
    } else if (paymentFilter === "NUEVOS") {
      matchPayment = esAlumnoNuevo(a.created_at);
    }

    const matchSinEntrenar = !sinEntrenarFilter || DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids.includes(a.id);

    const matchActividad =
      filtroActividad === "TODAS" ||
      alumnoTieneActividad({
        alumnoId: a.id,
        actividad: filtroActividad,
        alumnoActividades: store.alumnoActividades?.length ? store.alumnoActividades : DEMO_ALUMNO_ACTIVIDADES,
        contrataciones: store.contrataciones?.length ? store.contrataciones : DEMO_CONTRATACIONES_CLASES,
        planes,
        alumno: a,
      });

    return matchQuery && matchPayment && matchSinEntrenar && matchActividad;
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
  const chatAlumno = React.useMemo(() => {
    if (chatAlumnoId) {
      return alumnos.find((a) => a.id === chatAlumnoId) ?? null;
    }
    return selectedAlumno;
  }, [chatAlumnoId, alumnos, selectedAlumno]);
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
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Header de Coach Studio */}
          <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${leftCol}`}>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Coach Studio
                </h1>
                {isLoading ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Sincronizando...
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Gestión operativa táctil de atletas, semáforos de salud M3 y supervisión activa.
              </p>
            </div>
          </div>

          {/* Bandeja de Alertas Críticas Compacta (Exclusiva Dolor Articular con Quick Swap) */}
          {hasPendingAlerts && (
            <aside className="relative self-stretch xl:col-start-2 xl:row-start-1 xl:row-span-3">
              <CriticalAlertsInbox
                onSelectAlumno={(id) => selectAlumno(id)}
                onQuickSwap={handleOpenQuickSwapFromAlert}
              />
            </aside>
          )}

          {/* Banner Ejecutivo Compacto de Alumnos Activos (Poda de Bloatware Churn/Sin Plan Gigantes) */}
          <div className={leftCol}>
          <BusinessKpiStrip
            kpis={DEMO_KPIS_NEGOCIO}
            sinEntrenarNombres={alumnos
              .filter((a) => DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids.includes(a.id))
              .map((a) => a.nombre_completo)}
            sinRutina={metricas.cantSinPlanEntrenamiento}
            onAsignarClick={() => setIsAssignModalOpen(true)}
            onIngresosClick={() => {
              router.push("/studio/ingresos");
            }}
            onSinEntrenarClick={() => {
              setIsAlumnosExpanded(true);
              setSinEntrenarFilter(true);
              setCurrentPage(1);
            }}
          />
          </div>

          {/* Directorio de Atletas */}
          <div className="xl:col-span-2">
          <div
            className="rounded-2xl border border-border bg-card space-y-4 pb-4 [&>:not(button)]:mx-5"
            data-testid="alumnos-directory"
          >
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
                  placeholder="Buscar atleta…"
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
                    paymentFilter === "ALL"
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
                    paymentFilter === "ACTIVA"
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
                    paymentFilter === "PENDIENTE"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  Pago pendiente ({alumnos.filter((a) => a.estado_membresia === "PENDIENTE").length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentFilter("NUEVOS");
                    setCurrentPage(1);
                  }}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
                    paymentFilter === "NUEVOS"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  Nuevos ({alumnos.filter((a) => esAlumnoNuevo(a.created_at)).length})
                </button>

                {sinEntrenarFilter && (
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

                {/* Filtros rápidos por Actividad (GOZS-349) */}
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  data-testid="filtro-actividad-chips"
                >
                  <span className="text-xs text-muted-foreground font-medium">Actividad:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroActividad("TODAS");
                      setCurrentPage(1);
                    }}
                    data-testid="filtro-actividad-todas"
                    className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      filtroActividad === "TODAS"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroActividad(filtroActividad === "FUNCIONAL" ? "TODAS" : "FUNCIONAL");
                      setCurrentPage(1);
                    }}
                    data-testid="filtro-actividad-funcional"
                    className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      filtroActividad === "FUNCIONAL"
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Funcional
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroActividad(filtroActividad === "BOXEO" ? "TODAS" : "BOXEO");
                      setCurrentPage(1);
                    }}
                    data-testid="filtro-actividad-boxeo"
                    className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      filtroActividad === "BOXEO"
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Boxeo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroActividad(filtroActividad === "RUTINAS" ? "TODAS" : "RUTINAS");
                      setCurrentPage(1);
                    }}
                    data-testid="filtro-actividad-rutinas"
                    className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      filtroActividad === "RUTINAS"
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Rutina online
                  </button>
                </div>

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

                {/* Control rápido de Previsualización / Simulador de Atleta (GOZS-345) */}
                <div className="flex items-center gap-1.5" data-testid="preview-athlete-control">
                  <select
                    value={previewAlumno?.id || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) {
                        setPreviewAlumno(null);
                        return;
                      }
                      const found = alumnos.find((a) => a.id === id);
                      if (found) setPreviewAlumno(found);
                    }}
                    className="min-h-9 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-semibold text-foreground max-w-[170px] truncate"
                    data-testid="preview-athlete-select"
                    aria-label="Previsualizar experiencia de alumno"
                  >
                    <option value="">Vista previa alumno...</option>
                    {alumnos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre_completo}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const target =
                        previewAlumno ||
                        selectedAlumno ||
                        alumnos.find((a) => a.nombre_completo.toLowerCase().includes("miguel")) ||
                        alumnos[0] ||
                        null;
                      setPreviewAlumno(target);
                    }}
                    className="min-h-9 text-xs font-bold border-primary/40 text-primary hover:bg-primary/10 gap-1 rounded-lg"
                    data-testid="preview-athlete-btn"
                    title="Previsualizar experiencia de alumno en dispositivo móvil"
                  >
                    <span>👁️ Ver como Alumno</span>
                  </Button>
                </div>

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

              </div>
            </div>

            {/* Contenido según vista seleccionada */}
            {/* Cuadro Estadístico INDEC 1.1 con Semáforos M3 Puros y Ergonomía Táctil (Touch targets ≥ 48px) */}
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs w-full min-w-0 max-w-full">
              {/* Subheader & Metadatos INDEC */}
              <div className="border-b border-border/80 bg-secondary/30 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border/60 text-muted-foreground font-medium hidden md:inline">
                    Semana 42 / Octubre 2026
                  </span>
                </div>


                {/* Toggle Config: WhatsApp Opcional (Apagado por defecto) */}
                <div className="flex items-center gap-1.5 rounded-lg bg-secondary/60 border border-border/60 px-2.5 py-1 text-xs">
                  <label
                    htmlFor="toggle-whatsapp-config"
                    className="text-[11px] font-medium text-muted-foreground select-none cursor-pointer flex items-center gap-1.5"
                  >
                    <input
                      id="toggle-whatsapp-config"
                      type="checkbox"
                      checked={isWhatsAppEnabled}
                      onChange={(e) => setWhatsAppEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border accent-emerald-500 cursor-pointer"
                      data-testid="toggle-whatsapp-config"
                    />
                    <span>WhatsApp en acciones</span>
                  </label>
                </div>
              </div>

              {/* Tabla Matriz con Semáforos M3 (Contención estricta overflow-x-auto táctil) */}
              <div
                className="w-full min-w-0 max-w-full overflow-x-auto touch-pan-x overscroll-x-contain"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <table className="w-full min-w-[700px] text-xs border-collapse">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="py-2.5 px-3 text-left w-60 sticky left-0 bg-card z-10 border-r border-border/40">
                        Atleta (Columna Matriz)
                      </th>
                      <th className="py-2.5 px-3 text-center w-24">Cuota</th>
                      <th className="py-2.5 px-3 text-center w-28">Vigencia Rutina</th>
                      <th className="py-2.5 px-3 text-center w-24">Actividad</th>
                      <th className="py-2.5 px-3 text-left min-w-[130px] max-w-[190px]">Alertas</th>
                      <th className="py-2.5 px-3 text-center w-40">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-foreground">
                    {paginatedAlumnos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          No se encontraron atletas con los criterios seleccionados.
                        </td>
                      </tr>
                    ) : (
                      paginatedAlumnos.map((alumno) => {
                        const planActivo =
                          planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ?? null;
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

                        // Badges apilables de planes de membresía y multiactividad (GOZS-362)
                        const contratacionesAlumno = store.getContratacionesAlumno
                          ? store.getContratacionesAlumno(alumno.id)
                          : (store.contrataciones?.filter((c) => c.alumno_id === alumno.id && c.estado !== "VENCIDA") ?? []);
                        const planesCobros = useCobrosStore.getState().planes;
                        const badgesPlanes = contratacionesAlumno.map((c) => {
                          const plan = planesCobros.find((p) => p.id === c.plan_membresia_id);
                          const nombrePlan =
                            plan?.nombre ??
                            (c.plan_membresia_id === "demo-plan-funcional-2x"
                              ? "Funcional 2x"
                              : c.plan_membresia_id === "demo-plan-pase-libre"
                              ? "Pase Libre"
                              : c.plan_membresia_id ?? "Plan");
                          const precio =
                            c.precio_pactado ??
                            plan?.precio ??
                            (c.plan_membresia_id === "demo-plan-pase-libre" ? 40000 : 25000);
                          return derivarBadgePlan({
                            nombrePlan,
                            precio,
                            esVigente: c.estado === "VIGENTE" || c.estado === "POR_VENCER",
                            esAlDia: isAlDia,
                          });
                        });

                        // Cálculo Vigencia de Rutina (Micro-barra / pill sin nombre de archivo)
                        // 🟢 0-15 días, 🟡 16-21 días, 🔴 22+ días o sin plan (GOZS-242)
                        const vigenciaInfo = getRutinaVigenciaInfo(planActivo);
                        const rutinaPillColor = vigenciaInfo.pillColorClass;
                        const rutinaTooltip = vigenciaInfo.tooltip;

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
                        const badges = getDemoAlumnoAlerts(alumno.nombre_completo);
                        const estancadoInfo = estancadosMap.get(alumno.id);

                        const rowPaddingClass = "min-h-[48px] py-2.5";

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
                                    {esAlumnoNuevo(alumno.created_at) && (
                                      <span className="ml-1.5 align-middle text-[10px] rounded bg-secondary px-1.5 font-normal text-muted-foreground">
                                        Nuevo
                                      </span>
                                    )}
                                    {estancadoInfo && (
                                      <span
                                        data-testid={`badge-estancado-nombre-${alumno.id}`}
                                        className="ml-1.5 align-middle text-[10px] rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 font-bold text-amber-600 dark:text-amber-400"
                                        title={`Alumno estancado (+30 días sin PR: ${estancadoInfo.diasSinPR} días)`}
                                      >
                                        +30d sin PR
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                    {obtenerActividadesAlumno({
                                      alumnoId: alumno.id,
                                      alumnoActividades: store.alumnoActividades?.length ? store.alumnoActividades : DEMO_ALUMNO_ACTIVIDADES,
                                      contrataciones: store.contrataciones?.length ? store.contrataciones : DEMO_CONTRATACIONES_CLASES,
                                      planes,
                                      alumno,
                                    }).map((act) => (
                                      <span
                                        key={act}
                                        data-testid={`badge-actividad-${act.toLowerCase()}`}
                                        className="inline-block text-[9px] font-semibold px-1 rounded bg-secondary/80 text-muted-foreground"
                                      >
                                        {ETIQUETAS_ACTIVIDAD[act]}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </button>
                            </td>

                            {/* 2. Cuota (Semáforo M3 Puro: Círculo 10-12px + Badges Apilables Multiactividad) */}
                            <td className={`${rowPaddingClass} px-3 text-center`} data-testid="columna-cuota-actividad">
                              <div className="flex flex-col items-center justify-center gap-1">
                                <div className="flex items-center justify-center">
                                  <span
                                    className={`inline-block h-3 w-3 rounded-full ${cuotaDotColor}`}
                                    title={cuotaTooltip}
                                    aria-label={cuotaTooltip}
                                    role="status"
                                  />
                                </div>
                                {badgesPlanes.length > 0 && (
                                  <div className="flex flex-col gap-0.5 items-center mt-0.5" data-testid="badges-planes-apilados">
                                    {badgesPlanes.map((b, idx) => (
                                      <span
                                        key={idx}
                                        data-testid="badge-plan-apilado"
                                        className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-bold tracking-tight border leading-tight ${b.className}`}
                                        title={b.tooltip}
                                      >
                                        {b.label}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 3. Vigencia de Rutina (Micro-barra o pill sin nombre de archivo, cero texto) */}
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

                            {/* 4. Actividad / Recencia (Dot de último entreno/login, cero texto) */}
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

                            {/* 5. Columna de Alertas Responsive (min-w-[130px] max-w-[190px] sin desbordamiento) */}
                            <td className={`${rowPaddingClass} px-3 text-left`}>
                              <div className="flex flex-wrap gap-1.5 min-w-[130px] max-w-[190px]">
                                {estancadoInfo && (
                                  <span
                                    data-testid={`badge-estancado-${alumno.id}`}
                                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-xs"
                                    title={`Alumno estancado (+30 días sin PR: ${estancadoInfo.diasSinPR} días)`}
                                    aria-label="Alumno estancado (+30 días sin PR)"
                                  >
                                    <span>⚠️</span> +30d sin PR
                                  </span>
                                )}
                                {badges.length === 0 && !estancadoInfo ? (
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

                            {/* 6. Acciones Táctiles "Fat-Finger Friendly" (Touch targets de 48 × 48 px y separación ≥ 8px) */}
                            <td className={`${rowPaddingClass} px-3 text-center`}>
                              <div className="flex items-center justify-center gap-2">
                                {/* Botón Chat por la App (Enviar mensaje) */}
                                <button
                                  type="button"
                                  onClick={() => openChatForAlumno(alumno.id)}
                                  className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 active:scale-95 transition-all shadow-xs"
                                  title="Enviar mensaje"
                                  aria-label={`Enviar mensaje a ${alumno.nombre_completo}`}
                                  data-testid={`btn-enviar-mensaje-${alumno.id}`}
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
                                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                    />
                                  </svg>
                                </button>

                                {/* Botón WhatsApp directo con integración wa.me y templates argentinos (solo si está habilitado en config) */}
                                {isWhatsAppEnabled && (
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
                                )}

                                {/* Botón Vista Previa / Simulador Móvil del Alumno */}
                                <button
                                  type="button"
                                  onClick={() => setPreviewAlumno(alumno)}
                                  className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-secondary hover:bg-primary/20 text-muted-foreground hover:text-primary border border-border/60 active:scale-95 transition-all shadow-xs"
                                  title="Vista previa de atleta en móvil"
                                  aria-label={`Vista previa de atleta para ${alumno.nombre_completo}`}
                                  data-testid={`btn-preview-alumno-${alumno.id}`}
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
                                      d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                                    />
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
                                    onClick={() => setAssignRoutineTarget(alumno)}
                                    className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold active:scale-95 transition-all shadow-xs"
                                    title="Asignar rutina"
                                    aria-label={`Asignar rutina a ${alumno.nombre_completo}`}
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
                  Fuente: GOZSter Studio / Dataset demo
                </span>
              </div>
            </div>

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
          onPreviewAthlete={(a) => setPreviewAlumno(a)}
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
        onOpenAssignRoutine={(alumno) => {
          setIsAssignModalOpen(false);
          setAssignRoutineTarget(alumno);
        }}
      />

      {/* Modal de Previsualización y Confirmación de Rutinas Genéricas (GOZS-245) */}
      <AssignRoutinePreviewModal
        isOpen={!!assignRoutineTarget}
        onClose={() => setAssignRoutineTarget(null)}
        alumno={assignRoutineTarget}
        onConfirmAssign={async (alumnoId, plantillaId) => {
          await asignarPlanDesdePlantilla(alumnoId, plantillaId);
          setAssignRoutineTarget(null);
        }}
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
        planInicial={activePlan}
        diasIniciales={dias}
        ejerciciosEnRutinaIniciales={ejerciciosEnRutina}
        onRoutineSaved={() => loadLiveSupabaseData()}
      />

      {/* Modal Simulador / Vista Previa de Atleta en marco móvil (GOZS-345) */}
      <AthletePreviewModal
        isOpen={previewAlumno !== null}
        onClose={() => setPreviewAlumno(null)}
        alumnoId={previewAlumno?.id}
        alumnoNombre={previewAlumno?.nombre_completo}
        dataset={{
          alumnos,
          planes,
          dias,
          ejerciciosEnRutina,
          ejercicios,
        }}
        onSelectAlumno={(id) => {
          const found = alumnos.find((a) => a.id === id);
          if (found) setPreviewAlumno(found);
        }}
      />

      {/* Modal de Diagrama de Sankey (GOZS-349) */}
      <StudioSankeyModal
        isOpen={isSankeyModalOpen}
        onClose={() => setIsSankeyModalOpen(false)}
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
        alumno={chatAlumno || selectedAlumno}
        isOpen={isChatOpen}
        onToggle={() => setChatOpen(!isChatOpen)}
      />
    </div>
  );
}
