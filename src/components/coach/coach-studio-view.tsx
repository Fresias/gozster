"use client";

import * as React from "react";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    getSelectedAlumno,
    getPlanesAlumnoCronologico,
    getRutinaActivaAlumno,
    getHistorialCargasAlumno,
  } = useCoachStudioStore();

  const { isOnline, pendingEvents } = useOfflineQueueStore();
  const [filterQuery, setFilterQuery] = React.useState("");
  const [paymentFilter, setPaymentFilter] = React.useState<"ALL" | "ACTIVA" | "PENDIENTE">("ALL");

  // Metrics calculation
  const activasCount = alumnos.filter((a) => a.estado_membresia === "ACTIVA").length;
  const sinRutinaCount = alumnos.filter((a) => {
    const planesAlumno = planes.filter((p) => p.alumno_id === a.id && p.estado === "ACTIVO");
    return planesAlumno.length === 0;
  }).length;
  const churnRiskCount = alumnos.filter((a) => a.estado_membresia === "INACTIVA" || a.estado_membresia === "BAJA").length;

  // Filtering students
  const filteredAlumnos = alumnos.filter((a) => {
    const matchQuery =
      a.nombre_completo.toLowerCase().includes(filterQuery.toLowerCase()) ||
      (a.email?.toLowerCase().includes(filterQuery.toLowerCase()) ?? false);
    const matchPayment = paymentFilter === "ALL" || a.estado_membresia === paymentFilter;
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
              <strong>Modo Offline Activo:</strong> Las rutinas y clonaciones se guardan optimísticamente en la cola ({pendingEvents.length} pendientes).
            </span>
          </div>
        </div>
      )}

      {/* Main view switcher */}
      {!selectedAlumno ? (
        <div className="space-y-6">
          {/* Header & Metrics */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Coach Studio
            </h1>
            <p className="text-sm text-muted-foreground">
              Gestión táctil de atletas, rutinas de fuerza y supervisión de cargas.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="bg-card/90">
              <CardHeader className="p-4 sm:p-5">
                <CardDescription className="text-xs">Atletas Activos</CardDescription>
                <CardTitle className="text-2xl font-bold text-primary">
                  {activasCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
                Membresía al día
              </CardContent>
            </Card>

            <Card className="bg-card/90">
              <CardHeader className="p-4 sm:p-5">
                <CardDescription className="text-xs">Sin Rutina Asignada</CardDescription>
                <CardTitle className="text-2xl font-bold text-amber-400">
                  {sinRutinaCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
                Planificación pendiente
              </CardContent>
            </Card>

            <Card className="bg-card/90">
              <CardHeader className="p-4 sm:p-5">
                <CardDescription className="text-xs">Riesgo de Churn</CardDescription>
                <CardTitle className="text-2xl font-bold text-rose-400">
                  {churnRiskCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
                Inactivos o dados de baja
              </CardContent>
            </Card>
          </div>

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

          {/* Pagination Controls - safe spacing, avoids FAB collision */}
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

      {/* Lateral Panel / Modal: Historical Loads & RPE */}
      <HistoricalLoadsDrawer
        isOpen={isHistoricalLoadsOpen}
        onClose={() => setHistoricalLoadsOpen(false)}
        alumno={selectedAlumno}
        historial={historialCargas}
      />

      {/* Floating Action Button (FAB) of Chat - safely positioned */}
      <ChatFab
        alumno={selectedAlumno}
        isOpen={isChatOpen}
        onToggle={() => setChatOpen(!isChatOpen)}
      />
    </div>
  );
}
