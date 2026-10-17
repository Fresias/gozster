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

export function CoachStudioView() {
  const {
    alumnos,
    planes,
    dias,
    ejerciciosEnRutina,
    ejercicios,
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
    isLiveDatabase,
    loadLiveSupabaseData,
    getSelectedAlumno,
    getPlanesAlumnoCronologico,
    getRutinaActivaAlumno,
    getHistorialCargasAlumno,
  } = useCoachStudioStore();

  React.useEffect(() => {
    loadLiveSupabaseData();
  }, [loadLiveSupabaseData]);

  const { isOnline, pendingEvents } = useOfflineQueueStore();
  const [filterQuery, setFilterQuery] = React.useState("");
  const [paymentFilter, setPaymentFilter] = React.useState<
    "ALL" | "ACTIVA" | "PENDIENTE" | "SIN_PLAN"
  >("ALL");
  const [activeSection, setActiveSection] = React.useState<"atletas" | "sobrecarga">("atletas");
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);

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

            <div className="flex items-center gap-2">
              <Link
                href="/studio/dashboard"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                📊 Vista Analíticas Completa →
              </Link>
            </div>
          </div>

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
              className={`min-h-11 rounded-md px-4 text-xs sm:text-sm font-semibold transition-colors ${
                activeSection === "atletas"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/40"
              }`}
            >
              👥 Directorio de Atletas ({filteredAlumnos.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "sobrecarga"}
              onClick={() => setActiveSection("sobrecarga")}
              className={`min-h-11 rounded-md px-4 text-xs sm:text-sm font-semibold transition-colors ${
                activeSection === "sobrecarga"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/40"
              }`}
            >
              🔥 Alertas de Sobrecarga ({alertas.length})
            </button>
          </div>

          {activeSection === "atletas" ? (
            <div className="space-y-6">
              {/* Search and Filters */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="w-full sm:max-w-xs">
                  <input
                    type="search"
                    value={filterQuery}
                    onChange={(e) => {
                      setFilterQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Buscar alumno por nombre..."
                    className="min-h-11 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Filtro:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentFilter("ALL");
                      setCurrentPage(1);
                    }}
                    className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
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
                    className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
                      paymentFilter === "ACTIVA"
                        ? "bg-emerald-500/20 text-emerald-400"
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
                    className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
                      paymentFilter === "PENDIENTE"
                        ? "bg-amber-500/20 text-amber-400"
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
                    className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
                      paymentFilter === "SIN_PLAN"
                        ? "bg-rose-500/20 text-rose-400"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Sin Plan ({metricas.cantSinPlanEntrenamiento})
                  </button>
                </div>
              </div>

              {/* Student Cards Layout (<768px ergonomic card layout) */}
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
