"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useChatStore } from "@/store/use-chat-store";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { RetentionKpiCards } from "@/components/coach/retention-kpi-cards";
import { AssignPlanModal } from "@/components/coach/assign-plan-modal";
import { AssignRoutinePreviewModal } from "@/components/coach/assign-routine-preview-modal";
import type { Perfil } from "@/types/database.types";
import { ProgressiveOverloadFeed } from "@/components/coach/progressive-overload-feed";
import { HistoricalLoadsDrawer } from "@/components/coach/historical-loads-drawer";
import { ChatFab } from "@/components/coach/chat-fab";
import { ActivityLabels } from "@/components/coach/activity-labels";
import { Button } from "@/components/ui/button";
import {
  ETIQUETAS_FILTRO_ACTIVIDAD,
  alumnoTieneActividad,
  derivarLabelsActividadAlumno,
} from "@/lib/alumno-actividades";

import type { AlumnoEstancado, LiveSupabaseDataset } from "@/services/alumnos-service";
import {
  DEMO_ALUMNO_ACTIVIDADES,
  DEMO_CONTRATACIONES_CLASES,
  DEMO_GIMNASIO,
  DEMO_KPIS_NEGOCIO,
} from "@/services/coach-demo-dataset";
import { crearKpisNegocioVacios, type KpisNegocio } from "@/lib/kpis-negocio";

export interface CoachDashboardViewProps {
  initialDataset?: LiveSupabaseDataset | null;
  estancados?: AlumnoEstancado[];
  kpis?: KpisNegocio;
}

export function CoachDashboardView({
  initialDataset,
  estancados = [],
  kpis: propKpis,
}: CoachDashboardViewProps = {}) {
  const router = useRouter();
  const store = useCoachStudioStore();

  const hasInitialData = Boolean(initialDataset);
  const isLive = hasInitialData || store.isLiveDatabase;
  const kpis: KpisNegocio = propKpis ?? (isLive ? crearKpisNegocioVacios() : DEMO_KPIS_NEGOCIO);
  const [hydratedDataset, setHydratedDataset] = React.useState<LiveSupabaseDataset | undefined>(
    undefined,
  );
  const useHydratedStore = hasInitialData && hydratedDataset === initialDataset && store.isLiveDatabase;

  const alumnos = hasInitialData
    ? (useHydratedStore ? store.alumnos : initialDataset!.alumnos)
    : isLive
    ? store.alumnos
    : DEMO_GIMNASIO.alumnos;

  const planes = hasInitialData
    ? (useHydratedStore ? store.planes : initialDataset!.planes)
    : isLive
    ? store.planes
    : DEMO_GIMNASIO.planes;

  const planesCobros = useCobrosStore((s) => s.planes);
  const cobrosIsLiveMode = useCobrosStore((s) => s.isLiveMode);

  const alumnoActividadesEfectivas = hasInitialData
    ? (store.isLiveDatabase && store.alumnoActividades.length > 0
        ? store.alumnoActividades
        : (initialDataset?.alumnoActividades ?? []))
    : store.isLiveDatabase
    ? store.alumnoActividades
    : (store.alumnoActividades.length > 0 ? store.alumnoActividades : DEMO_ALUMNO_ACTIVIDADES);

  const contratacionesEfectivas = hasInitialData
    ? (store.isLiveDatabase && store.contrataciones.length > 0
        ? store.contrataciones
        : (initialDataset?.contrataciones ?? []))
    : store.isLiveDatabase
    ? store.contrataciones
    : (store.contrataciones.length > 0 ? store.contrataciones : DEMO_CONTRATACIONES_CLASES);

  const planesMembresiaEfectivos =
    hasInitialData && !cobrosIsLiveMode && Array.isArray(initialDataset?.planesMembresia)
      ? (initialDataset.planesMembresia.length > 0
          ? initialDataset.planesMembresia
          : planesCobros.filter((p) => !p.id.startsWith("demo-")))
      : planesCobros;

  const getLabelsAlumno = React.useCallback(
    (alumnoId: string) =>
      derivarLabelsActividadAlumno({
        alumnoId,
        alumnoActividades: alumnoActividadesEfectivas,
        contrataciones: contratacionesEfectivas,
        planes,
        planesMembresia: planesMembresiaEfectivos,
      }),
    [alumnoActividadesEfectivas, contratacionesEfectivas, planes, planesMembresiaEfectivos],
  );

  const {
    toast,
    isHistoricalLoadsOpen,
    isChatOpen,
    selectedAlumnoId,
    chatAlumnoId,
    dismissToast,
    selectAlumno,
    setHistoricalLoadsOpen,
    setChatOpen,
    setChatAlumnoId,
    obtenerMetricasRetencion,
    getAlertasSobrecargaProgresiva,
    asignarPlanUrgente,
    asignarPlanDesdePlantilla,
    getSelectedAlumno,
    getHistorialCargasAlumno,
    loadLiveSupabaseData,
    filtroActividad,
    setFiltroActividad,
  } = store;

  React.useEffect(() => {
    if (initialDataset) {
      const timer = setTimeout(() => {
        useCoachStudioStore.setState({
          alumnos: initialDataset.alumnos,
          planes: initialDataset.planes,
          dias: initialDataset.dias,
          ejerciciosEnRutina: initialDataset.ejerciciosEnRutina,
          ejercicios: initialDataset.ejercicios,
          contrataciones: initialDataset.contrataciones || [],
          alumnoActividades: initialDataset.alumnoActividades || [],
          historialCargas: {},
          sustituciones: [],
          isLiveDatabase: true,
        });
        useCobrosStore.getState().hydrateFromLiveDataset(initialDataset);
        setHydratedDataset(initialDataset);
      }, 0);
      return () => clearTimeout(timer);
    } else {
      loadLiveSupabaseData();
    }
  }, [initialDataset, loadLiveSupabaseData]);

  const { isOnline, pendingEvents } = useOfflineQueueStore();
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [assignRoutineTarget, setAssignRoutineTarget] = React.useState<Perfil | null>(null);

  // Retention metrics from RPC sincronizadas con KpisNegocio (GOZS-401)
  const baseMetricas = obtenerMetricasRetencion(null, filtroActividad);
  const valorKpisActivas = kpis.cantActivas ?? kpis.alumnos_activos;
  const metricas = {
    ...baseMetricas,
    cantActivas:
      filtroActividad === "TODAS" && typeof valorKpisActivas === "number"
        ? valorKpisActivas
        : baseMetricas.cantActivas,
  };

  // Progressive overload alerts from RPC
  const alertas = getAlertasSobrecargaProgresiva();

  // Students requiring routine
  const alumnosSinPlan = alumnos.filter((a) => {
    if (a.rol !== "ALUMNO") return false;
    const isActiva = a.estado_membresia === "ACTIVA";
    if (!isActiva) return false;
    if (filtroActividad !== "TODAS") {
      const tiene = alumnoTieneActividad({
        alumnoId: a.id,
        actividad: filtroActividad,
        alumnoActividades: alumnoActividadesEfectivas,
        contrataciones: contratacionesEfectivas,
        planes,
        alumno: a,
      });
      if (!tiene) return false;
    }
    const planActivo = planes.find((p) => p.alumno_id === a.id && p.estado === "ACTIVO");
    return !planActivo;
  });

  const selectedAlumno = getSelectedAlumno();
  const historialCargas = selectedAlumno ? getHistorialCargasAlumno(selectedAlumno.id) : [];
  const chatAlumno = React.useMemo(() => {
    if (chatAlumnoId) {
      return alumnos.find((a) => a.id === chatAlumnoId) ?? null;
    }
    return null;
  }, [chatAlumnoId, alumnos]);

  const handleOpenHistoricalLoadsFor = (alumnoId: string) => {
    selectAlumno(alumnoId);
    setHistoricalLoadsOpen(true);
  };

  const handleSelectAlumno = (alumnoId: string) => {
    selectAlumno(alumnoId);
    router.push("/studio");
  };

  const handleAssignPlan = async (alumnoId: string) => {
    await asignarPlanUrgente(alumnoId);
  };

  return (
    <div className="relative w-full max-w-full overflow-x-hidden pb-28 sm:pb-32 space-y-6">
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
          className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span>
              <strong>Modo Offline Activo:</strong> Las métricas y alertas se calculan en local. ({pendingEvents.length} eventos en cola).
            </span>
          </div>
        </div>
      )}

      {/* Header & Quick Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Métricas &amp; Retención
          </h1>
          <p className="text-sm text-muted-foreground">
            Métricas de retención del gimnasio y supervisión automática de sobrecarga progresiva.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/studio"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
          >
            👥 Ver Directorio de Atletas
          </Link>
        </div>
      </div>

      {/* Selector de Filtro por Actividad */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="filtro-actividad-container"
      >
        <span className="text-xs text-muted-foreground font-semibold">Actividad:</span>
        {(["TODAS", "FUNCIONAL", "BOXEO", "RUTINAS"] as const).map((act) => {
          const isActive = filtroActividad === act;
          const label = ETIQUETAS_FILTRO_ACTIVIDAD[act];
          const count = act === "TODAS"
            ? alumnos.length
            : alumnos.filter((a) =>
                alumnoTieneActividad({
                  alumnoId: a.id,
                  actividad: act,
                  alumnoActividades: alumnoActividadesEfectivas,
                  contrataciones: contratacionesEfectivas,
                  planes,
                  alumno: a,
                })
              ).length;

          return (
            <button
              key={act}
              type="button"
              data-testid={`filtro-actividad-${act.toLowerCase()}`}
              onClick={() => setFiltroActividad(act)}
              className={`min-h-11 sm:min-h-9 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-border"
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Tarjetas KPI de Retención (RPC: obtener_metricas_retencion sincronizadas con KpisNegocio) */}
      <RetentionKpiCards
        metricas={metricas}
        kpis={kpis}
        onAssignPlanClick={() => setIsAssignModalOpen(true)}
      />

      {/* Alerta de estancamiento: 30+ días sin PR (GOZS-226) */}
      {estancados.length > 0 && (
        <section
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
          data-testid="alerta-estancamiento"
        >
          <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">Alumnos estancados (30+ días sin PR)</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {estancados.map((e) => (
              <li key={e.alumnoId} className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => handleSelectAlumno(e.alumnoId)} className="hover:underline">
                  {alumnos.find((a) => a.id === e.alumnoId)?.nombre_completo ?? "Alumno"}
                </button>
                <ActivityLabels labels={getLabelsAlumno(e.alumnoId)} />
                <span className="text-muted-foreground">· {e.diasSinPR} días sin PR</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Feed de Alertas de Sobrecarga Progresiva (RPC: detectar_sobrecarga_progresiva y 1RM) */}
      <div className="pt-2">
        <ProgressiveOverloadFeed
          alertas={alertas}
          onSelectAlumno={handleSelectAlumno}
          onOpenHistoricalLoads={handleOpenHistoricalLoadsFor}
          getLabelsAlumno={getLabelsAlumno}
        />
      </div>

      {/* Modal de Asignación Urgente de Rutinas */}
      <AssignPlanModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        alumnosSinPlan={alumnosSinPlan}
        onAssignPlan={handleAssignPlan}
        onSelectAlumno={handleSelectAlumno}
        onOpenAssignRoutine={(alumno) => {
          setIsAssignModalOpen(false);
          setAssignRoutineTarget(alumno);
        }}
        getLabelsAlumno={getLabelsAlumno}
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

      {/* Drawer Lateral de Cargas Históricas */}
      <HistoricalLoadsDrawer
        isOpen={isHistoricalLoadsOpen}
        onClose={() => setHistoricalLoadsOpen(false)}
        alumno={selectedAlumno}
        historial={historialCargas}
      />

      {/* Floating Action Button (FAB) de Chat */}
      <ChatFab
        alumno={chatAlumno}
        isOpen={isChatOpen}
        onToggle={() => {
          if (isChatOpen) {
            setChatAlumnoId(null);
            useChatStore.getState().setSelectedAlumnoId(null);
          }
          setChatOpen(!isChatOpen);
        }}
      />
    </div>
  );
}
