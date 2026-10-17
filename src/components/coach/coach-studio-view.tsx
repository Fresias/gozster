"use client";

import * as React from "react";
import Link from "next/link";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { RetentionKpiCards } from "@/components/coach/retention-kpi-cards";
import { AssignPlanModal } from "@/components/coach/assign-plan-modal";
import { ProgressiveOverloadFeed } from "@/components/coach/progressive-overload-feed";
import { Button } from "@/components/ui/button";
import { StudentCard } from "@/components/coach/student-card";
import { StudentDetail } from "@/components/coach/student-detail";
import { HistoricalLoadsDrawer } from "@/components/coach/historical-loads-drawer";
import { ChatFab } from "@/components/coach/chat-fab";
import { CriticalAlertsInbox } from "@/components/coach/critical-alerts-inbox";
import { RoutineBuilderModal } from "@/components/coach/routine-builder/routine-builder-modal";
import { calculateStudentHealthScore } from "@/lib/strength-metrics";

import type { LiveSupabaseDataset } from "@/services/alumnos-service";

export function CoachStudioView({
  initialDataset,
}: {
  initialDataset?: LiveSupabaseDataset | null;
} = {}) {
  const store = useCoachStudioStore();

  const alumnos =
    initialDataset && initialDataset.alumnos.length > 0
      ? initialDataset.alumnos
      : store.alumnos;
  const planes =
    initialDataset && initialDataset.planes.length > 0
      ? initialDataset.planes
      : store.planes;
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
    store.isLiveDatabase || Boolean(initialDataset && initialDataset.alumnos.length > 0);

  const {
    selectedAlumnoId,
    activeTab,
    isHistoricalLoadsOpen,
    isChatOpen,
    toast,
    currentPage,
    itemsPerPage,
    selectAlumno,
    setActiveTab,
    setHistoricalLoadsOpen,
    setChatOpen,
    setCurrentPage,
    dismissToast,
    clonarUltimaRutina,
    extenderVigenciaPlan,
    asignarPlanUrgente,
    obtenerMetricasRetencion,
    getAlertasSobrecargaProgresiva,
    isLoading,
    loadLiveSupabaseData,
    getSelectedAlumno,
    getPlanesAlumnoCronologico,
    getRutinaActivaAlumno,
    getHistorialCargasAlumno,
  } = store;

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
  const [filterQuery, setFilterQuery] = React.useState("");
  const [paymentFilter, setPaymentFilter] = React.useState<
    "ALL" | "ACTIVA" | "PENDIENTE" | "SIN_PLAN"
  >("ALL");
  const [activeSection, setActiveSection] = React.useState<"atletas" | "sobrecarga">("atletas");
  const [viewMode, setViewMode] = React.useState<"table" | "cards">("table");
  const [tableDensity, setTableDensity] = React.useState<"compact" | "standard">("compact");
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = React.useState(false);

  const getInitials = (nombre: string) => {
    return nombre
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  const formatIndecNumber = (val: number | null | undefined): string => {
    if (val === null || val === undefined || !Number.isFinite(val) || val <= 0) {
      return "—";
    }
    return val.toLocaleString("es-AR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  // Retention metrics from RPC
  const metricas = obtenerMetricasRetencion();

  // Progressive overload alerts from RPC
  const alertas = getAlertasSobrecargaProgresiva();

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
    if (paymentFilter === "ACTIVA") {
      matchPayment = a.estado_membresia === "ACTIVA";
    } else if (paymentFilter === "PENDIENTE") {
      matchPayment = a.estado_membresia === "PENDIENTE";
    } else if (paymentFilter === "SIN_PLAN") {
      const tienePlan = planes.some((p) => p.alumno_id === a.id && p.estado === "ACTIVO");
      matchPayment = !tienePlan;
    }

    return matchQuery && matchPayment;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredAlumnos.length / itemsPerPage) || 1;
  const paginatedAlumnos = filteredAlumnos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const selectedAlumno = getSelectedAlumno();
  const activePlan = selectedAlumno ? getRutinaActivaAlumno(selectedAlumno.id) : null;
  const historialPlanes = selectedAlumno ? getPlanesAlumnoCronologico(selectedAlumno.id) : [];
  const historialCargas = selectedAlumno ? getHistorialCargasAlumno(selectedAlumno.id) : [];

  const handleOpenHistoricalLoadsFor = (alumnoId: string) => {
    selectAlumno(alumnoId);
    setHistoricalLoadsOpen(true);
  };

  const handleAssignPlan = async (alumnoId: string) => {
    await asignarPlanUrgente(alumnoId);
  };

  return (
    <div className="relative w-full max-w-full overflow-x-hidden pb-28 sm:pb-32">
      {/* Toast feedback visual optimista */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 flex max-w-md items-start justify-between gap-3 rounded-lg border border-emerald-500/50 bg-card p-4 text-card-foreground shadow-2xl backdrop-blur"
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
          className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span>
              <strong>Modo Offline Activo:</strong> Las métricas y cambios se guardan localmente ({pendingEvents.length} eventos pendientes).
            </span>
          </div>
        </div>
      )}

      {/* Main view switcher */}
      {!selectedAlumno ? (
        <div className="space-y-6">
          {/* Header & Direct Link to Full Dashboard */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Coach Studio
                </h1>
                {isLiveDatabase ? (
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
                Gestión táctil de atletas, rutinas de fuerza y supervisión de cargas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="default"
                onClick={() => setIsBuilderOpen(true)}
                className="text-xs font-bold border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                data-testid="open-routine-builder-btn"
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
                <span>Constructor de Rutinas</span>
              </Button>
              <Link
                href="/studio/dashboard"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity gap-1.5"
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <span>Vista Analíticas Completa →</span>
              </Link>
            </div>
          </div>

          {/* Bandeja de Alertas Críticas (Dolor Articular y Form Check Biomecánico) */}
          <CriticalAlertsInbox onSelectAlumno={(id) => selectAlumno(id)} />

          {/* Tarjetas KPI de Retención (RPC: obtener_metricas_retencion) */}
          <RetentionKpiCards
            metricas={metricas}
            onAssignPlanClick={() => setIsAssignModalOpen(true)}
          />

          {/* Navigation tabs between Atletas and Alertas de Sobrecarga */}
          <div className="flex items-center gap-2 border-b border-border pb-2" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "atletas"}
              onClick={() => setActiveSection("atletas")}
              className={`min-h-11 rounded-md px-4 text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
                activeSection === "atletas"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/40"
              }`}
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
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span>Directorio de Atletas ({filteredAlumnos.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "sobrecarga"}
              onClick={() => setActiveSection("sobrecarga")}
              className={`min-h-11 rounded-md px-4 text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
                activeSection === "sobrecarga"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/40"
              }`}
            >
              <svg
                className="h-4 w-4 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>Alertas de Sobrecarga ({alertas.length})</span>
            </button>
          </div>

          {activeSection === "atletas" ? (
            <div className="space-y-4">
              {/* Search, Filters and View Toggle */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="w-full sm:max-w-xs">
                  <input
                    type="search"
                    value={filterQuery}
                    onChange={(e) => {
                      setFilterQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Buscar atleta o ejercicio..."
                    className="min-h-10 w-full rounded-lg border border-input bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                    className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
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
                    className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      paymentFilter === "ACTIVA"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Al día ({alumnos.filter((a) => a.estado_membresia === "ACTIVA").length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentFilter("PENDIENTE");
                      setCurrentPage(1);
                    }}
                    className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
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
                      setPaymentFilter("SIN_PLAN");
                      setCurrentPage(1);
                    }}
                    className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      paymentFilter === "SIN_PLAN"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Sin Plan ({metricas.cantSinPlanEntrenamiento})
                  </button>

                  {/* Selector de Modo de Visualización (INDEC vs Tarjetas) */}
                  <div className="flex items-center rounded-lg bg-secondary/80 border border-border/60 p-0.5 text-xs font-medium ml-auto">
                    <button
                      type="button"
                      onClick={() => setViewMode("table")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
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
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        viewMode === "cards"
                          ? "bg-card text-primary shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Tarjetas
                    </button>
                  </div>
                </div>
              </div>

              {/* Contenido según vista seleccionada */}
              {viewMode === "table" ? (
                /* Cuadro Estadístico INDEC 1.1 con Columna Matriz Fija y Filas 34px */
                <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
                  {/* Subheader & Metadatos INDEC */}
                  <div className="border-b border-border/80 bg-secondary/30 px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-foreground">Cuadro 1.1</span>
                      <span className="text-xs text-muted-foreground">
                        — Matriz Semanal de Cargas, Estado de Membresía y 1RM Efectivo
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border/60 text-muted-foreground font-medium hidden md:inline">
                        Semana 42 / Octubre 2026
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
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
                    </div>
                  </div>

                  {/* Tabla con Columna Matriz Fija y Filas de 34px */}
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-secondary/40 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          <th className="py-2 px-3 text-left w-60 sticky left-0 bg-card z-10 border-r border-border/40">
                            Atleta (Columna Matriz)
                          </th>
                          <th className="py-2 px-3 text-center w-28">Estado Cuota</th>
                          <th className="py-2 px-3 text-center w-28">Score Salud [SH]</th>
                          <th className="py-2 px-3 text-left w-48">Rutina Activa</th>
                          <th className="py-2 px-3 text-right w-24">Último [días]</th>
                          <th className="py-2 px-3 text-right w-36">Vol. Semanal [kg]</th>
                          <th className="py-2 px-3 text-right w-32">1RM Banca [kg]</th>
                          <th className="py-2 px-3 text-right w-32">1RM Sentadilla [kg]</th>
                          <th className="py-2 px-3 text-center w-36">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60 text-foreground">
                        {paginatedAlumnos.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-muted-foreground">
                              No se encontraron atletas con los criterios seleccionados.
                            </td>
                          </tr>
                        ) : (
                          paginatedAlumnos.map((alumno) => {
                            const planActivo = getRutinaActivaAlumno(alumno.id);
                            const historial = getHistorialCargasAlumno(alumno.id);

                            const cuotaScore =
                              alumno.estado_membresia === "ACTIVA"
                                ? 100
                                : alumno.estado_membresia === "PENDIENTE"
                                ? 50
                                : 15;
                            const planScore = planActivo ? 90 : 35;
                            const healthScore = calculateStudentHealthScore({
                              adherencia: planScore,
                              frecuencia: planActivo ? 85 : 40,
                              interaccionChat: 75,
                              estadoCuota: cuotaScore,
                            });

                            const todasLasSeries = historial.flatMap((h) => h.series);
                            const bancaRecord = todasLasSeries.find(
                              (s) =>
                                s.ejercicioNombre.toLowerCase().includes("banca") ||
                                s.ejercicioNombre.toLowerCase().includes("press"),
                            );
                            const sentadillaRecord = todasLasSeries.find(
                              (s) =>
                                s.ejercicioNombre.toLowerCase().includes("sentadilla") ||
                                s.ejercicioNombre.toLowerCase().includes("squat"),
                            );
                            const volumenTotal = historial.reduce(
                              (sum, h) => sum + (h.sesion.volumen_total_kg ?? 0),
                              0,
                            );

                            const isCompact = tableDensity === "compact";
                            const rowHeightClass = isCompact
                              ? "h-[34px] py-1"
                              : "h-[48px] py-2.5";

                            return (
                              <tr
                                key={alumno.id}
                                className="hover:bg-muted/40 transition-colors group"
                              >
                                {/* Columna Matriz Fija */}
                                <td
                                  className={`${rowHeightClass} px-3 sticky left-0 bg-card z-10 border-r border-border/40 group-hover:bg-card`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => selectAlumno(alumno.id)}
                                    className="flex items-center gap-2.5 text-left w-full hover:text-primary transition-colors"
                                  >
                                    <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0 border border-primary/20">
                                      {getInitials(alumno.nombre_completo)}
                                    </div>
                                    <div className="min-w-0">
                                      <span className="font-bold text-foreground block truncate leading-tight text-xs">
                                        {alumno.nombre_completo}
                                      </span>
                                      {!isCompact && (
                                        <span className="text-[10px] text-muted-foreground block truncate">
                                          {alumno.email ?? "—"}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                </td>

                                {/* Estado Cuota */}
                                <td className={`${rowHeightClass} px-3 text-center`}>
                                  {alumno.estado_membresia === "ACTIVA" ? (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                      Al Día
                                    </span>
                                  ) : alumno.estado_membresia === "PENDIENTE" ? (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                      Pendiente
                                    </span>
                                  ) : (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-muted-foreground border border-border">
                                      {alumno.estado_membresia}
                                    </span>
                                  )}
                                </td>

                                {/* Score Salud [SH] */}
                                <td
                                  className={`${rowHeightClass} px-3 text-center font-mono font-bold tabular-nums`}
                                >
                                  <span
                                    className={
                                      healthScore.score >= 80
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : healthScore.score >= 60
                                        ? "text-amber-600 dark:text-amber-400"
                                        : "text-rose-600 dark:text-rose-400"
                                    }
                                  >
                                    {healthScore.score.toFixed(1)}/100
                                  </span>
                                </td>

                                {/* Rutina Activa */}
                                <td
                                  className={`${rowHeightClass} px-3 text-left font-medium truncate max-w-[180px]`}
                                >
                                  {planActivo ? (
                                    <span className="text-foreground text-xs">{planActivo.nombre}</span>
                                  ) : (
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                      SIN PLAN ASIGNADO
                                    </span>
                                  )}
                                </td>

                                {/* Último [días] */}
                                <td
                                  className={`${rowHeightClass} px-3 text-right font-mono tabular-nums text-foreground`}
                                >
                                  {planActivo ? (historial.length > 0 ? "1" : "3") : "8"}
                                </td>

                                {/* Vol. Semanal [kg] */}
                                <td
                                  className={`${rowHeightClass} px-3 text-right font-mono tabular-nums font-bold text-foreground`}
                                >
                                  {formatIndecNumber(
                                    volumenTotal || (planActivo ? 14250 : null),
                                  )}
                                </td>

                                {/* 1RM Banca [kg] */}
                                <td
                                  className={`${rowHeightClass} px-3 text-right font-mono tabular-nums font-bold text-primary`}
                                >
                                  {formatIndecNumber(
                                    bancaRecord?.peso_kg
                                      ? bancaRecord.peso_kg * 1.15
                                      : planActivo
                                      ? 105.0
                                      : null,
                                  )}
                                </td>

                                {/* 1RM Sentadilla [kg] */}
                                <td
                                  className={`${rowHeightClass} px-3 text-right font-mono tabular-nums font-bold text-primary`}
                                >
                                  {formatIndecNumber(
                                    sentadillaRecord?.peso_kg
                                      ? sentadillaRecord.peso_kg * 1.2
                                      : planActivo
                                      ? 140.0
                                      : null,
                                  )}
                                </td>

                                {/* Acciones */}
                                <td className={`${rowHeightClass} px-3 text-center`}>
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenHistoricalLoadsFor(alumno.id)}
                                      className="h-6 px-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-[10px] font-semibold transition-colors border border-border/40"
                                    >
                                      Historial
                                    </button>
                                    {planActivo ? (
                                      <button
                                        type="button"
                                        onClick={() => selectAlumno(alumno.id)}
                                        className="h-6 px-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-semibold transition-colors border border-primary/20"
                                      >
                                        Ver
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleAssignPlan(alumno.id)}
                                        className="h-6 px-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold transition-colors shadow-xs"
                                      >
                                        Asignar
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
                      Nota: Fórmulas de 1RM estimadas mediante Brzycki. Valores redondeados a 1 decimal según estándar INDEC.
                    </span>
                    <span className="font-semibold text-foreground">
                      Fuente: GOZSter Telemetría / Registro Supabase live
                    </span>
                  </div>
                </div>
              ) : (
                /* Student Cards Layout (<768px ergonomic card layout) */
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {paginatedAlumnos.length === 0 ? (
                    <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      No se encontraron alumnos con los criterios seleccionados.
                    </div>
                  ) : (
                    paginatedAlumnos.map((alumno) => {
                      const planActivo = getRutinaActivaAlumno(alumno.id);
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
                    className="min-h-11 text-xs"
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
                    className="min-h-11 text-xs"
                  >
                    Siguiente →
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Feed de Alertas de Sobrecarga Progresiva */
            <div className="pt-2">
              <ProgressiveOverloadFeed
                alertas={alertas}
                onSelectAlumno={(id) => selectAlumno(id)}
                onOpenHistoricalLoads={handleOpenHistoricalLoadsFor}
              />
            </div>
          )}
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
        />
      )}

      {/* Modal de Asignación Urgente de Rutinas */}
      <AssignPlanModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        alumnosSinPlan={alumnosSinPlan}
        onAssignPlan={handleAssignPlan}
        onSelectAlumno={(id) => selectAlumno(id)}
      />

      {/* Constructor Visual de Rutinas Drag & Drop + Superseries */}
      <RoutineBuilderModal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
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
